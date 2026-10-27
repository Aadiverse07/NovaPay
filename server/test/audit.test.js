import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuditHelper, auditApiAction } from '../src/services/audit.js';

test('audit helper writes tenant, actor, request, and action fields without response bodies', async () => {
  let tableName;
  let payload;
  const helper = createAuditHelper({ from(table) { tableName = table; return { async insert(value) { payload = value; return { error: null }; } }; } });
  const req = { orgId: 'org-a', user: { id: 'user-a' }, id: 'request-1' };
  await auditApiAction({ audit: helper }, req, { action: 'paypal.refund', entity: 'capture', entityId: 'capture-a', metadata: { amount: '1.00' } });
  assert.equal(tableName, 'audit_log');
  assert.deepEqual(payload, { org_id: 'org-a', actor_id: 'user-a', action: 'paypal.refund', entity: 'capture', entity_id: 'capture-a', metadata: { amount: '1.00' }, request_id: 'request-1' });
});

test('audit helper reports failure without echoing provider details', async () => {
  const helper = createAuditHelper({ from() { return { async insert() { return { error: new Error('secret-sentinel') }; } }; } });
  await assert.rejects(helper({ orgId: 'org-a', actorId: 'user-a', action: 'a', entity: 'e', requestId: 'r' }), /Audit entry could not be recorded/);
});
