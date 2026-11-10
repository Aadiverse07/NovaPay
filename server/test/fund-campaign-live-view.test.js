import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';

const orgA = 'a0000000-0000-4000-8000-000000000001';
const orgB = 'b0000000-0000-4000-8000-000000000002';
const users = new Map([
  ['owner-token', { id: 'owner-a', org: orgA, role: 'owner' }],
  ['viewer-token', { id: 'viewer-a', org: orgA, role: 'viewer' }],
  ['other-token', { id: 'owner-b', org: orgB, role: 'owner' }],
]);
const identity = {
  async verifyToken(token) { return users.has(token) ? { id: users.get(token).id } : null; },
  async membership(userId, orgId) { const user = [...users.values()].find((item) => item.id === userId); return user?.org === orgId ? { role: user.role } : null; },
};
const config = { ENABLE_COMMUNITY_FUNDS: true, ENABLE_MAINTENANCE: true, PORT: 3000, STATIC_DIR: process.cwd(), hasPayPal: false, hasSupabase: true, hasAI: false };

test('campaign list is live and organization scoped; owner can create, viewer receives 403', async () => {
  const repos = createRepositories();
  const campaignA = await repos.funds.createCampaign({ orgId: orgA, actorId: 'owner-a', title: 'A test', purpose: 'Test A', targetMinor: 10000, organiser: 'Org A', status: 'active' });
  await repos.funds.createCampaign({ orgId: orgB, actorId: 'owner-b', title: 'B test', purpose: 'Test B', targetMinor: 20000, organiser: 'Org B', status: 'active' });
  const app = createApp({ config, repos, identity, paypal: { async pp() { throw new Error('unexpected provider call'); } }, askAI: async () => ({}) });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = (token, org, path, init = {}) => fetch(base + path, { ...init, headers: { authorization: `Bearer ${token}`, 'x-org-id': org, ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers || {}) } });
  try {
    const listA = await call('owner-token', orgA, '/funds/campaigns');
    const dataA = await listA.json(); assert.equal(listA.status, 200); assert.equal(dataA.role, 'owner'); assert.deepEqual(dataA.campaigns.map((item) => item.id), [campaignA.id]);
    const listB = await call('other-token', orgB, '/funds/campaigns');
    const dataB = await listB.json(); assert.equal(dataB.campaigns.length, 1); assert.notEqual(dataB.campaigns[0].id, campaignA.id);
    const body = { title: 'New campaign', purpose: 'A live API test', targetMinor: 12345, currency: 'USD', organiser: 'Test organization', status: 'active' };
    const created = await call('owner-token', orgA, '/funds/campaigns', { method: 'POST', body: JSON.stringify(body) });
    assert.equal(created.status, 201); assert.equal((await created.json()).campaign.currency, 'USD');
    const denied = await call('viewer-token', orgA, '/funds/campaigns', { method: 'POST', body: JSON.stringify(body) });
    assert.equal(denied.status, 403);
    const isolated = await call('other-token', orgB, '/funds/campaigns');
    assert.equal((await isolated.json()).campaigns.length, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
