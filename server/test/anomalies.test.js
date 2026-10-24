import test from 'node:test';
import assert from 'node:assert/strict';
import { detectAnomalies } from '../src/ai/anomalies.js';
import { createAnomalyService, startAnomalyWorker } from '../src/services/anomalies.js';
import { createRepositories } from '../src/repos/memory.js';

const now = new Date('2026-10-24T12:00:00.000Z');
const tx = (id, type, amount, fee, time, more = {}) => ({ id, source_type: type, amount_minor: String(amount), fee_minor: fee == null ? null : String(fee), currency: 'USD', status: 'COMPLETED', occurred_at: time, ...more });
const defaults = { ANOMALY_FEE_SPIKE_MULTIPLIER: 2, ANOMALY_FEE_SPIKE_MIN_SAMPLES: 3, ANOMALY_DUPLICATE_WINDOW_MINUTES: 10, ANOMALY_REFUND_RATE_THRESHOLD: 0.25, ANOMALY_LARGE_PAYOUT_MINOR: 1000000, ANOMALY_STALE_WEBHOOK_MINUTES: 10 };

test('fee-rate spike uses trailing fee-bearing captures and exact threshold boundary', () => {
  const rows = [
    tx('CAP-1', 'capture', 10000, 100, '2026-10-21T09:00:00Z'),
    tx('CAP-2', 'capture', 10000, 100, '2026-10-22T09:00:00Z'),
    tx('CAP-3', 'capture', 10000, 100, '2026-10-23T09:00:00Z'),
    tx('CAP-4', 'capture', 10000, 200, '2026-10-24T09:00:00Z'),
  ];
  const hit = detectAnomalies({ transactions: rows, config: defaults, now });
  assert.equal(hit.filter((item) => item.rule === 'fee_rate_spike').length, 1);
  rows[3].fee_minor = '199';
  assert.equal(detectAnomalies({ transactions: rows, config: defaults, now }).some((item) => item.rule === 'fee_rate_spike'), false);
  assert.equal(detectAnomalies({ transactions: rows.slice(0, 3), config: defaults, now }).some((item) => item.rule === 'fee_rate_spike'), false);
});

test('duplicate amount+payer requires a payer reference and a duplicate within the configured window', () => {
  const rows = [
    tx('CAP-1', 'capture', 5000, 200, '2026-10-24T11:54:00Z', { payer_ref: 'private-payer-ref' }),
    tx('CAP-2', 'capture', 5000, 200, '2026-10-24T11:59:00Z', { payer_ref: 'private-payer-ref' }),
    tx('CAP-3', 'capture', 5000, 200, '2026-10-24T11:59:00Z'),
  ];
  const findings = detectAnomalies({ transactions: rows, config: defaults, now }).filter((item) => item.rule === 'duplicate_amount_payer');
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].evidenceIds, ['CAP-1', 'CAP-2']);
  assert.doesNotMatch(JSON.stringify(findings), /private-payer-ref/);
  assert.equal(detectAnomalies({ transactions: [rows[0], { ...rows[1], occurred_at: '2026-10-24T11:40:00Z' }], config: defaults, now }).some((item) => item.rule === 'duplicate_amount_payer'), false);
});

test('refund-rate spike is based on completed gross totals with an exact configured boundary', () => {
  const rows = [tx('CAP-1', 'capture', 10000, 0, '2026-10-22T00:00:00Z'), tx('REF-1', 'refund', 2500, 0, '2026-10-23T00:00:00Z')];
  assert.equal(detectAnomalies({ transactions: rows, config: defaults, now }).some((item) => item.rule === 'refund_rate_spike'), true);
  rows[1].amount_minor = '2499';
  assert.equal(detectAnomalies({ transactions: rows, config: defaults, now }).some((item) => item.rule === 'refund_rate_spike'), false);
  rows[1].status = 'PENDING';
  assert.equal(detectAnomalies({ transactions: rows, config: defaults, now }).some((item) => item.rule === 'refund_rate_spike'), false);
});

test('large payout, reconciliation mismatch, stale webhook and dead-letter boundaries', () => {
  const transactions = [tx('PAY-1', 'payout', 1000000, 0, '2026-10-24T10:00:00Z')];
  const events = [
    { event_id: 'EV-OLD', processing_status: 'queued', created_at: '2026-10-24T11:49:00Z' },
    { event_id: 'EV-NEW', processing_status: 'queued', created_at: '2026-10-24T11:55:00Z' },
    { event_id: 'EV-DEAD', processing_status: 'dead_letter', created_at: '2026-10-24T11:59:00Z' },
  ];
  const findings = detectAnomalies({ transactions, events, reconciliation: { id: 'REC-1', status: 'mismatch', currency: 'USD' }, config: defaults, now });
  assert.deepEqual(findings.map((item) => item.rule).sort(), ['dead_letter_webhook', 'large_payout', 'stale_webhook', 'webhook_ledger_mismatch']);
  assert.equal(detectAnomalies({ transactions: [tx('PAY-2', 'payout', 999999, 0, '2026-10-24T10:00:00Z')], events: [events[1]], config: defaults, now }).length, 0);
});

test('anomaly persistence is idempotent and creates a notification only once', async () => {
  const repos = createRepositories();
  const input = { transactions: [tx('CAP-1', 'capture', 10000, 0, '2026-10-24T11:00:00Z'), tx('REF-1', 'refund', 2500, 0, '2026-10-24T11:30:00Z')], events: [], reconciliation: { status: 'clean' } };
  repos.listTransactions = async (orgId) => { assert.equal(orgId, 'org-a'); return input.transactions; };
  repos.events.anomalyCandidates = async (orgId) => { assert.equal(orgId, 'org-a'); return input.events; };
  repos.reconcile = async (orgId) => { assert.equal(orgId, 'org-a'); return input.reconciliation; };
  const run = createAnomalyService({ repos, config: defaults, now: () => now });
  const first = await run('org-a');
  const second = await run('org-a');
  assert.equal(first.created, 1);
  assert.equal(second.created, 0);
  assert.equal((await repos.notifications.list('org-a')).length, 1);
  assert.equal((await repos.notifications.list('org-b')).length, 0);
});

test('scheduled anomaly worker scans known organizations and can stop cleanly', async () => {
  const scanned = [];
  const worker = startAnomalyWorker({ repos: { ai: { async listOrgIds() { return ['org-a', 'org-b']; } } }, runAnomalyScan: async (orgId) => scanned.push(orgId), intervalMs: 60000, logger: { warn() {} } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  worker.stop();
  assert.deepEqual(scanned.sort(), ['org-a', 'org-b']);
});
