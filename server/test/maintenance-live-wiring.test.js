import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { fundRoutes } from '../src/routes/funds.js';
import { createRepositories } from '../src/repos/memory.js';
import '../../src/currency-minor.js';

const orgA = 'a0000000-0000-4000-8000-000000000001';
const orgB = 'b0000000-0000-4000-8000-000000000002';
const identities = new Map([
  ['owner-token', { id: 'owner-a', org: orgA, role: 'owner' }],
  ['viewer-token', { id: 'viewer-a', org: orgA, role: 'viewer' }],
  ['other-token', { id: 'owner-b', org: orgB, role: 'owner' }],
]);

function start(repos) {
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    const actor = identities.get((req.get('authorization') || '').replace(/^Bearer\s+/, ''));
    if (!actor) return res.status(401).json({ error: 'Unauthenticated' });
    const org = req.get('x-org-id'); if (org !== actor.org) return res.status(403).json({ error: 'Forbidden' });
    req.user = { id: actor.id }; req.orgId = org; req.orgRole = actor.role; req.id = `maintenance-${Math.random()}`; next();
  });
  app.use('/api', fundRoutes({ config: { hasPayPal: false }, repos, paypal: { async pp() { throw new Error('unexpected provider call'); } } }));
  const server = app.listen(0, '127.0.0.1');
  return new Promise((resolve) => server.once('listening', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/api` })));
}

test('maintenance live list and detail are org scoped; viewer can read but cannot create', async () => {
  const repos = createRepositories(); const { server, base } = await start(repos);
  const call = (token, org, path, init = {}) => fetch(base + path, { ...init, headers: { authorization: `Bearer ${token}`, 'x-org-id': org, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
  try {
    const created = await call('owner-token', orgA, '/funds/maintenance', { method: 'POST', body: JSON.stringify({ title: 'Pump repair', scope: 'Description: Replace the pump', estimateMinor: 12500 }) });
    assert.equal(created.status, 201); const item = (await created.json()).request; assert.equal(item.status, 'requested');
    const listA = await call('viewer-token', orgA, '/funds/maintenance'); const dataA = await listA.json();
    assert.equal(listA.status, 200); assert.equal(dataA.role, 'viewer'); assert.equal(dataA.requests.length, 1); assert.equal(dataA.requests[0].id, item.id);
    assert.equal(dataA.requests[0].activity.length, 1); assert.equal(dataA.requests[0].activity[0].action, 'fund.maintenance.requested');
    const detail = await call('viewer-token', orgA, `/funds/maintenance/${item.id}`); assert.equal(detail.status, 200); assert.equal((await detail.json()).request.id, item.id);
    const listB = await call('other-token', orgB, '/funds/maintenance'); assert.equal((await listB.json()).requests.length, 0);
    const foreign = await call('other-token', orgB, `/funds/maintenance/${item.id}`); assert.equal(foreign.status, 404);
    const denied = await call('viewer-token', orgA, '/funds/maintenance', { method: 'POST', body: JSON.stringify({ title: 'Nope', scope: 'Not allowed' }) }); assert.equal(denied.status, 403);
    const unknown = await call('owner-token', orgA, '/funds/maintenance/00000000-0000-4000-8000-000000000099'); assert.equal(unknown.status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('authenticated dashboard activates live maintenance and prevents duplicate create submits', async () => {
  const [views, modules, html] = await Promise.all([
    readFile(new URL('../../src/fund-views.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/modules.js', import.meta.url), 'utf8'),
    readFile(new URL('../../dashboard.html', import.meta.url), 'utf8'),
  ]);
  assert.match(views, /startMaintenance\(\)/);
  assert.match(views, /NovaPayApi\.request\("\/api\/funds\/maintenance"/);
  assert.match(views, /No maintenance requests yet/);
  assert.match(views, /maintenanceSubmitting/);
  assert.match(views, /majorToMinor\(estimateRaw, currency\)/);
  assert.match(views, /statusFilter/);
  assert.match(views, /searchBox/);
  assert.match(modules, /submitMaintenance/);
  assert.match(views, /if \(maintenanceSubmitting\) return/);
  assert.match(views, /await window\.NovaPayApi\.request\("\/api\/funds\/maintenance", \{ method: "POST"/);
  assert.match(views, /if \(closeForm\) closeForm\(\); form\.reset\(\); await refresh\(\)/);
  assert.match(views, /if \(!auth \|\| auth\.mode !== "supabase"\)[\s\S]*?Sign in to create a live maintenance request/);
  assert.match(views, /if \(auth\.mode === "demo"\) \{ labelSampleViews\(\); return; \}/);
  assert.match(views, /\["title", "description", "location", "category", "priority"\]/);
  assert.match(views, /Payment request blocked: link the required invoice first/);
  assert.match(views, /\["community-funds", "maintenance"\]/);
  assert.match(views, /if \(auth.mode === "demo"\) \{ labelSampleViews\(\); return; \}/);
  assert.match(html, /name="description"/);
  assert.match(html, /name="location"/);
  assert.match(html, /name="category"/);
  assert.match(html, /name="priority"/);
  assert.match(views, /"No maintenance requests yet"/);
});

test('maintenance budgets convert major units using the selected currency exponent', () => {
  assert.equal(globalThis.NovaPayCurrency.majorToMinor('12.34', 'USD'), 1234);
  assert.equal(globalThis.NovaPayCurrency.majorToMinor('5', 'JPY'), 5);
  assert.equal(globalThis.NovaPayCurrency.majorToMinor('1.234', 'KWD'), 1234);
  assert.throws(() => globalThis.NovaPayCurrency.majorToMinor('0', 'USD'));
});
