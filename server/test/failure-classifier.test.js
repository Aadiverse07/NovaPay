import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFailure } from '../src/services/failureClassifier.js';
import { detectAnomalies } from '../src/ai/anomalies.js';
import { createRepositories } from '../src/repos/memory.js';

test('classifies network, provider, declined and refund limit failures distinctly', () => {
  assert.equal(classifyFailure({ networkError: true }).category, 'network');
  assert.equal(classifyFailure({ httpStatus: 503 }).category, 'provider_outage');
  assert.equal(classifyFailure({ httpStatus: 422, providerIssues: ['INSTRUMENT_DECLINED'] }).category, 'bank_or_card_declined');
  assert.equal(classifyFailure({ httpStatus: 422, providerIssues: ['REFUND_AMOUNT_EXCEEDED'] }).category, 'refund_limit');
  assert.equal(classifyFailure({ httpStatus: 422, providerIssues: ['UNRECOGNIZED'] }).category, 'unknown');
});

test('repeated payment failures create one category anomaly inside configured window', () => {
  const now = new Date('2026-11-09T10:00:00Z');
  const failures = [0,1,2].map((n) => ({ id: `f${n}`, category: 'network', occurred_at: new Date(now.getTime() - n * 60000).toISOString() }));
  const result = detectAnomalies({ failures, config: {}, now });
  assert.equal(result.find((row) => row.rule === 'repeated_payment_failures')?.evidenceIds.length, 3);
});

test('failure repository records and paginates by organization', async () => {
  const repos = createRepositories();
  await repos.failures.record({ org_id: 'org-a', operation: 'capture', category: 'network', code: 'NETWORK_ERROR' });
  await repos.failures.record({ org_id: 'org-b', operation: 'refund', category: 'unknown', code: 'UNKNOWN_FAILURE' });
  assert.equal((await repos.failures.list('org-a')).length, 1);
  assert.equal((await repos.failures.list('org-a'))[0].operation, 'capture');
});
