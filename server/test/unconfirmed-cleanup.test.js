import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanupUnconfirmed } from '../../scripts/lib/unconfirmed-user-cleanup.mjs';

const users = [
  { id: 'old-unconfirmed', created_at: '2026-10-30T00:00:00Z', email_confirmed_at: null },
  { id: 'recent-unconfirmed', created_at: '2026-10-31T23:00:00Z', email_confirmed_at: null },
  { id: 'confirmed', created_at: '2026-10-20T00:00:00Z', email_confirmed_at: '2026-10-20T01:00:00Z' },
  { id: 'invalid-date', created_at: 'invalid', email_confirmed_at: null },
];

test('unconfirmed cleanup defaults to dry run and selects only users older than 24 hours', async () => {
  let deletes = 0;
  const result = await cleanupUnconfirmed({ listUsers: async () => users, hasRetainedReferences: async () => false, deleteUser: async () => { deletes += 1; }, now: Date.parse('2026-11-01T12:00:00Z') });
  assert.deepEqual(result, { eligible: 1, skippedReferenced: 0, deleted: 0, dryRun: true });
  assert.equal(deletes, 0);
});

test('cleanup apply excludes referenced or confirmed users and deletes only eligible unconfirmed users', async () => {
  const deleted = [];
  const result = await cleanupUnconfirmed({ listUsers: async () => users, hasRetainedReferences: async (id) => id === 'old-unconfirmed', deleteUser: async (id) => deleted.push(id), dryRun: false, now: Date.parse('2026-11-01T12:00:00Z') });
  assert.deepEqual(result, { eligible: 1, skippedReferenced: 1, deleted: 0, dryRun: false });
  assert.deepEqual(deleted, []);
  const clear = await cleanupUnconfirmed({ listUsers: async () => users, hasRetainedReferences: async () => false, deleteUser: async (id) => deleted.push(id), dryRun: false, now: Date.parse('2026-11-01T12:00:00Z') });
  assert.deepEqual(clear, { eligible: 1, skippedReferenced: 0, deleted: 1, dryRun: false });
  assert.deepEqual(deleted, ['old-unconfirmed']);
});
