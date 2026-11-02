import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const data = require('../../src/reports-data.js');
const live = await readFile(new URL('../../src/reports-live.js', import.meta.url), 'utf8');
const modules = await readFile(new URL('../../src/modules.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../dashboard.html', import.meta.url), 'utf8');
const format = (minor, currency) => currency + ' ' + (Number(minor) / 100).toFixed(2);

test('report totals aggregate integer minor units separately for each currency', () => {
  const result = data.summary([
    { currency: 'INR', account_type: 'revenue', amount_minor: '13750' },
    { currency: 'USD', account_type: 'revenue', amount_minor: '2500' },
    { currency: 'INR', account_type: 'expense', amount_minor: '500' },
    { currency: 'INR', account_type: 'contra_revenue', amount_minor: '200' }
  ], [{ currency: 'INR', fee_minor: '100' }], [{ currency: 'INR', refund_minor: '200' }], format);
  assert.equal(result.revenue, 'INR 137.50 · USD 25.00');
  assert.equal(result.fees, 'INR 1.00');
  assert.equal(result.refunds, 'INR 2.00');
  assert.equal(result.net, 'INR 130.50 · USD 25.00');
});

test('empty report data returns honest empty labels and no fabricated totals', () => {
  const result = data.summary([], [], [], format);
  assert.equal(result.revenue, 'No activity'); assert.equal(result.net, 'No activity');
  assert.match(live, /No report activity yet\./);
  assert.match(live, /No report activity in this period\./);
});

test('Reports loads org-scoped APIs through NovaPayApi, has retry, live detail and CSV', () => {
  for (const endpoint of ['profit-and-loss', 'fees', 'refunds', 'trial-balance']) assert.ok(live.includes('queryPath("' + endpoint + '"'));
  assert.match(live, /api\.request\(queryPath/); assert.match(live, /reports-retry/);
  assert.match(live, /novapay:financial-refresh/); assert.match(live, /novapay-organization-reports\.csv/);
  assert.match(modules, /NovaPayReports\.exportCsv\(\)/); assert.match(modules, /NovaPayReports\.open\(/);
  assert.doesNotMatch(modules, /novapay-report-sample\.csv|845000|₹8,45,000/);
  const reports = html.split('id="view-reports"')[1].split('id="view-documents"')[0];
  assert.doesNotMatch(reports, /₹8,45,000|₹5\.4L|illustrative sample data/i);
  assert.match(reports, /id="reports-live-status"/); assert.match(reports, /id="reports-retry"/);
});
