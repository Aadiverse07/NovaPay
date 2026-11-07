import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const data = require('../../src/financial-data.js');
const liveSource = await readFile(new URL('../../src/financial-live.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../dashboard.html', import.meta.url), 'utf8');
const dataSource = await readFile(new URL('../../src/financial-data.js', import.meta.url), 'utf8');
const gridSource = await readFile(new URL('../../src/transactions-grid.js', import.meta.url), 'utf8');
const modulesSource = await readFile(new URL('../../src/modules.js', import.meta.url), 'utf8');

test('API transaction rows map saved amount, fee, net, date, status and capture id', () => {
  const row = data.transactionRow({ id: 'row-1', type: 'capture', sourceId: 'CAP-1', captureId: 'CAP-1', status: 'COMPLETED', amount: '10.00', fee: '0.59', net: '9.41', currency: 'USD', occurredAt: '2026-11-01T12:00:00Z' });
  assert.equal(row.id, 'CAP-1');
  assert.equal(row.cells[3], 'USD 10.00');
  assert.equal(row.cells[4], 'USD 0.59');
  assert.equal(row.cells[5], 'USD 9.41');
  assert.equal(row.date, '2026-11-01T12:00:00Z');
  assert.equal(row.status, 'COMPLETED');
  assert.equal(row.source, 'paypal-sandbox');
});

test('transaction dedupe collapses live/API copies and prefers each refund id', () => {
  const rows = data.dedupeTransactions([
    { id: 'db1', captureId: 'CAP-1' }, { id: 'live1', captureId: 'CAP-1' },
    { id: 'r1', captureId: 'CAP-1', refundId: 'REF-1' }, { id: 'r2', captureId: 'CAP-1', refundId: 'REF-2' }
  ]);
  assert.deepEqual(rows.map((row) => data.key(row)), ['CAP-1', 'REF-1', 'REF-2']);
});

test('ledger totals are grouped by currency and report imbalance without cross-currency sums', () => {
  const entries = [
    { id: 'j1', currency: 'USD', lines: [{ currency: 'USD', debit_minor: '1000', credit_minor: '0' }, { currency: 'USD', debit_minor: '0', credit_minor: '1000' }] },
    { id: 'j2', currency: 'JPY', lines: [{ currency: 'JPY', debit_minor: '500', credit_minor: '0' }, { currency: 'JPY', debit_minor: '0', credit_minor: '450' }] }
  ];
  const summary = data.ledgerSummary(entries);
  assert.equal(summary.debits, 'JPY 500 · USD 10.00');
  assert.equal(summary.credits, 'JPY 450 · USD 10.00');
  assert.equal(summary.balanced, false);
  assert.equal(summary.unreconciledCount, 1);
  assert.equal(data.formatMinor('12345', 'INR'), 'INR 123.45');
});

test('ledger error state uses a clear retryable message, never object coercion', () => {
  assert.equal(data.errorMessage({ error: { code: 'ORG_FORBIDDEN', message: 'private backend detail' } }, 'ledger'), "Couldn't load ledger.");
  assert.match(liveSource, /button\.textContent = "Retry"/);
  assert.match(liveSource, /root\.console\.error\("Could not load saved ledger", cause\)/);
  assert.equal(data.errorMessage(new Error('network failure'), 'transactions'), "Couldn't load saved transactions.");
  assert.match(dataSource, /Couldn't load " \+ label/);
});

test('live views fetch saved transaction and ledger pages and refresh on focus/view changes', () => {
  assert.match(liveSource, /return root\.NovaPayApi\.request\(path\)/);
  assert.match(liveSource, /var pagePath = offset === 0 \? path/);
  assert.match(liveSource, /pages\("\/api\/transactions", "transactions"\)/);
  assert.match(liveSource, /pages\("\/api\/ledger\/entries", "entries"\)/);
  assert.match(liveSource, /root\.addEventListener\("focus", refreshPassive\)/);
  assert.match(liveSource, /root\.document\.addEventListener\("visibilitychange", refreshPassive\)/);
  assert.match(liveSource, /now - lastPassiveRefresh < 30000/);
  assert.match(html, /src="src\/financial-live\.js"/);
  assert.doesNotMatch(html, /data-ledger-sample/);
});

test('authenticated transactions wait for Supabase auth and render API-only rows', () => {
  assert.match(liveSource, /if \(auth && auth\.ready\) await auth\.ready/);
  assert.match(liveSource, /auth\.mode !== "supabase" \|\| !auth\.isAuthenticated\(\)/);
  assert.match(liveSource, /body\.replaceChildren\(\)/);
  assert.match(liveSource, /No transactions yet\. Create a sandbox payment to get started\./);
  assert.match(liveSource, /Couldn't load saved transactions\./);
  assert.match(liveSource, /return root\.NovaPayApi\.request\(path\)/);
  assert.match(gridSource, /MutationObserver/);
  const transactionsPanel = html.split('id="view-transactions"')[1].split('id="view-ai-assistant"')[0];
  for (const sampleId of ['PAY-1001', 'PAY-1002', 'REF-1003', 'PAY-28491', 'DSP-1004', 'PAY-1005']) assert.ok(!transactionsPanel.includes(sampleId));
});

test('Payment check renderer uses live state/reasons and clears the loading placeholder before AG Grid mounts', () => {
  assert.match(gridSource, /valueGetter: function \(params\).*signal\.state/s);
  assert.match(gridSource, /signal && signal\.state \|\| rowSignal \|\| params\.value/);
  assert.match(gridSource, /signal\.reasons\.join\(" "\)/);
  assert.match(gridSource, /lastRows = core\.rowsFromDom\(tableBody\);\s*host\.replaceChildren\(\);\s*api = root\.agGrid\.createGrid/);
});

test('Run scan status is on its own line below the transaction filters', () => {
  const panel = html.split('id="view-transactions"')[1].split('id="view-ai-assistant"')[0];
  const filtersEnd = panel.indexOf('</div><p id="tx-scan-status"');
  const status = panel.indexOf('id="tx-scan-status"');
  assert.ok(filtersEnd >= 0 && status > filtersEnd);
  assert.doesNotMatch(panel.slice(panel.indexOf('class="filter-row tx-filters"'), filtersEnd), /tx-scan-status/);
});

test('ledger uses only saved rows, has an honest empty state, retry, and API CSV export', () => {
  assert.match(liveSource, /auth\.mode !== "supabase" \|\| !auth\.isAuthenticated\(\)/);
  assert.match(liveSource, /No ledger entries yet\. A saved transaction will create ledger entries\./);
  assert.match(liveSource, /Couldn't load saved ledger\./);
  assert.match(liveSource, /body\.replaceChildren\(\)/);
  assert.doesNotMatch(liveSource, /₹4,86,300|Illustrative sample/);
  const ledgerPanel = html.split('id="view-ledger"')[1].split('id="view-invoices"')[0];
  assert.doesNotMatch(ledgerPanel, /data-ledger-sample|PAY-1001/);
  assert.match(modulesSource, /api\.request\(path\)/);
  assert.match(modulesSource, /data\.ledgerRows\(entries\)/);
  assert.doesNotMatch(modulesSource, /novapay-ledger-sample\.csv|9700/);
});
