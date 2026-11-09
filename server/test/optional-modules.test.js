import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';
import { createAIService } from '../src/services/ai.js';
import { parseFastAssistantCommand, validateAssistantActions } from '../src/ai/actions.js';
import { config as parsedConfig } from '../src/config.js';

const org = 'a0000000-0000-4000-8000-000000000001';
const user = 'optional-modules-user';
const identity = { async verifyToken() { return { id: user }; }, async membership() { return { role: 'owner' }; } };
const config = { ENABLE_COMMUNITY_FUNDS: false, ENABLE_MAINTENANCE: false, PORT: 3000, STATIC_DIR: process.cwd(), hasSupabase: true, hasPayPal: false, hasAI: false };

test('optional module flags parse as booleans and default off', () => {
  assert.equal(parsedConfig.ENABLE_COMMUNITY_FUNDS, process.env.ENABLE_COMMUNITY_FUNDS === 'true');
  assert.equal(parsedConfig.ENABLE_MAINTENANCE, process.env.ENABLE_MAINTENANCE === 'true');
});

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('disabled module routes return structured 404s and status exposes both flags as off', async () => {
  const app = createApp({ config, repos: createRepositories(), identity });
  await withServer(app, async (base) => {
    for (const path of ['/api/funds/campaigns', '/api/funds/maintenance/requests']) {
      const response = await fetch(base + path, { headers: { authorization: 'Bearer ok', 'x-org-id': org } });
      assert.equal(response.status, 404);
      assert.deepEqual((await response.json()).error.code, 'MODULE_NOT_ENABLED');
    }
    const status = await fetch(base + '/api/status').then((response) => response.json());
    assert.deepEqual(status.capabilities, { communityFunds: false, maintenance: false });
  });
});

test('each module flag gates its own route family when the other module is enabled', async () => {
  const app = createApp({ config: { ...config, ENABLE_COMMUNITY_FUNDS: true }, repos: createRepositories(), identity });
  await withServer(app, async (base) => {
    const headers = { authorization: 'Bearer ok', 'x-org-id': org };
    assert.equal((await fetch(base + '/api/funds/campaigns', { headers })).status, 200);
    const maintenance = await fetch(base + '/api/funds/maintenance/requests', { headers });
    assert.equal(maintenance.status, 404);
    assert.equal((await maintenance.json()).error.code, 'MODULE_NOT_ENABLED');
  });
});

test('disabled modules are absent from dashboard entry points, routing, and assistant actions', async () => {
  const [html, dashboard, actions, notify] = await Promise.all([
    readFile(new URL('../../dashboard.html', import.meta.url), 'utf8'),
    readFile(new URL('../../src/dashboard.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/assistant-actions.js', import.meta.url), 'utf8'),
    readFile(new URL('../../src/notifications-live.js', import.meta.url), 'utf8'),
  ]);
  assert.match(html, /data-view="community-funds"[^>]*hidden/);
  assert.match(html, /data-view="maintenance"[^>]*hidden/);
  assert.match(dashboard, /view==="community-funds"&&window\.NovaPayFeatures\.communityFunds===false/);
  assert.match(dashboard, /view==="maintenance"&&window\.NovaPayFeatures\.maintenance===false/);
  assert.match(actions, /funds\.openCampaign/);
  assert.match(actions, /maintenance\.openNew/);
  assert.match(notify, /window\.NovaPayFeatures\.maintenance \? "maintenance" : "dashboard"/);
  assert.match(notify, /window\.NovaPayFeatures\.communityFunds \? "community-funds" : "dashboard"/);
  const service = createAIService({ config, provider: { async generate() { throw new Error('disabled-module question must not reach the model'); } } });
  const answer = await service('Open Community Funds', { role: 'owner' });
  assert.match(answer.reply, /not enabled/i);
  assert.deepEqual(answer.actions, []);
  assert.equal(parseFastAssistantCommand('open maintenance', 'owner', config), null);
  assert.deepEqual(validateAssistantActions([{ id: 'funds.openCampaign', args: {} }], 'open community funds', 'owner', config), []);
});

test('historical contribution payment rows remain available in Transactions and Ledger with modules disabled', async () => {
  const repos = createRepositories();
  repos.listTransactions = async (orgId) => [{ id: 'fund-capture-1', source_type: 'capture', source_id: 'fund-capture-1', status: 'COMPLETED', amount_minor: 2500, fee_minor: 100, net_minor: 2400, currency: 'USD', occurred_at: '2026-11-01T00:00:00.000Z', org_id: orgId }];
  repos.listLedgerEntries = async () => [{ id: 'ledger-fund-entry-1', entry_date: '2026-11-01', reference: 'fund-capture-1', account_name: 'Community Contributions', debit_minor: 2500, credit_minor: 2500, currency: 'USD', source_type: 'capture' }];
  const app = createApp({ config, repos, identity });
  await withServer(app, async (base) => {
    const headers = { authorization: 'Bearer ok', 'x-org-id': org };
    const transactions = await fetch(base + '/api/transactions', { headers });
    assert.equal(transactions.status, 200);
    assert.equal((await transactions.json()).transactions[0].id, 'fund-capture-1');
    const ledger = await fetch(base + '/api/ledger/entries', { headers });
    assert.equal(ledger.status, 200);
    assert.match(JSON.stringify(await ledger.json()), /ledger-fund-entry-1/);
  });
});
