import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const data = require('../../src/approvals-data.js');
const live = await readFile(new URL('../../src/novapay-live.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../../dashboard.html', import.meta.url), 'utf8');
const apiClient = await readFile(new URL('../../src/api-client.js', import.meta.url), 'utf8');

test('approval mapper uses persisted tenant approval fields without inventing evidence or amounts', () => {
  const item = data.map({ approvalId: 'ap-1', proposalType: 'refund', captureId: 'cap-1', amount: '10.00', currency: 'USD', status: 'pending_verification', requestPayload: { source: 'ai', title: 'Review refund', reason: 'Check capture', targetId: 'tx-1', evidenceIds: ['tx-1'] } });
  assert.equal(item.id, 'ap-1'); assert.equal(item.type, 'refund'); assert.equal(item.status, 'Pending Verification');
  assert.equal(item.display, 'USD 10.00'); assert.equal(item.evidence, 'Evidence record IDs: tx-1'); assert.equal(item.persisted, true);
  const sparse = data.map({ approvalId: 'ap-2', proposalType: 'other', status: 'pending', requestPayload: {} });
  assert.equal(sparse.display, 'Not applicable'); assert.equal(sparse.evidence, 'No supporting evidence IDs supplied.');
});

test('authenticated approvals use paginated org API, live pending count, server decisions and retryable errors', () => {
  assert.match(live, /NovaPayApi\.request\("\/api\/approvals\?limit=100&offset="\+offset\)/);
  assert.match(live, /approvalPendingCount=Number\(data\.pendingCount\)\|\|0/);
  assert.match(live, /\/api\/approvals\/"\+encodeURIComponent\(p\.approvalId\)\+"\/decision/);
  assert.match(live, /Couldn.t load approvals/);
  assert.match(live, /approval-live-retry/);
  assert.match(html, /src="src\/approvals-data\.js"/);
});

test('sample approvals are explicitly demo-only; authenticated mode hydrates only API records', () => {
  assert.match(live, /function demoMode\(\)\{return window\.NovaPayAuth&&window\.NovaPayAuth\.mode==="demo"\}/);
  assert.match(live, /queue=demoQueue\.slice\(\)/);
  assert.match(live, /if\(!demoMode\(\)\)\{loadApprovals\(\);return null\}/);
  assert.match(apiClient, /X-Org-Id/);
  assert.match(live, /approvalPendingCount:|pending=demoMode\(\)\?/);
  assert.match(live, /DEMO MODE · simulated only/);
  assert.match(live, /DEMO MODE · Illustrative sample proposals only/);
});
