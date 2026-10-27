import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMaintenanceRunFixtures, cleanupMaintenanceRun } from '../../scripts/phase6-maintenance-run.mjs';

test('maintenance verifier gets fresh requests and quotation references for every run', () => {
  const first = buildMaintenanceRunFixtures('run-one');
  const second = buildMaintenanceRunFixtures('run-two');
  assert.notEqual(first.low.title, second.low.title);
  assert.notEqual(first.threshold.title, second.threshold.title);
  assert.notEqual(first.low.documentRef, second.low.documentRef);
  assert.notEqual(first.threshold.documentRef, second.threshold.documentRef);
  assert.deepEqual([first.low.amountMinor, first.threshold.amountMinor], [9999, 10000]);
});

test('maintenance verifier cleanup is restricted to supplied run IDs and FK order', async () => {
  const calls = [];
  const result = await cleanupMaintenanceRun({
    orgId: 'org-fixed',
    requests: [{ id: 'request-run-a' }, { id: 'request-run-b' }],
    contractor: { id: 'contractor-created-this-run' },
    async service(path, options) { calls.push({ path, method: options.method }); return { status: 204, body: null }; },
  });
  assert.deepEqual(calls.map(({ method, path }) => `${method} ${path.split('?')[0]}`), [
    'PATCH /rest/v1/maintenance_requests',
    'DELETE /rest/v1/fund_maintenance_payments',
    'DELETE /rest/v1/fund_completion_evidence',
    'DELETE /rest/v1/fund_allocations',
    'DELETE /rest/v1/fund_approvals_chain',
    'DELETE /rest/v1/fund_quotations',
    'DELETE /rest/v1/maintenance_requests',
    'DELETE /rest/v1/fund_contractors',
  ]);
  for (const call of calls) {
    assert.match(call.path, /org_id=eq\.org-fixed/);
    if (!call.path.includes('fund_contractors')) assert.match(call.path, /request-run-a|request-run-b/);
  }
  assert.deepEqual(result, { requests: 2, contractor: 1 });
});
