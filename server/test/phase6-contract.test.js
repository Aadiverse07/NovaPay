import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createApp } from '../src/app.js';
import { config as baseConfig } from '../src/config.js';
import { createRepositories } from '../src/repos/memory.js';

const routeUrl = new URL('../src/routes/funds.js', import.meta.url);
const contractUrl = new URL('../../docs/FRONTEND-CONTRACT.md', import.meta.url);
const routesSource = await readFile(routeUrl, 'utf8');
const contract = await readFile(contractUrl, 'utf8');

test('every mounted Phase 6 fund route is documented in the frontend contract', () => {
  const routePattern = /router\.(get|post)\('([^']+)'/g;
  const routes = [...routesSource.matchAll(routePattern)].map(([, method, path]) => `${method.toUpperCase()} /api${path}`);
  assert.ok(routes.length >= 15, `expected fund route inventory, found ${routes.length}`);
  for (const route of routes) assert.ok(contract.includes(`### \`${route}\``), `missing route contract heading: ${route}`);
  assert.match(contract, /RATE_LIMITED/);
  assert.match(contract, /USER_RATE_LIMITED/);
  assert.match(contract, /SIMULATED/);
});

test('payment approval and fund API requests are covered by authenticated and IP rate limits', async () => {
  const originalLog = console.log;
  console.log = () => {};
  const listen = async (app) => {
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    return server;
  };
  try {
    const authenticatedApp = createApp({
      config: { ...baseConfig, hasSupabase: true, hasPayPal: false },
      identity: { async verifyToken() { return { id: 'phase6-rate-limit-approver' }; }, async membership() { return { role: 'approver' }; } },
      repos: createRepositories(),
      paypal: { async pp() { throw new Error('unexpected PayPal call'); } },
    });
    const authenticatedServer = await listen(authenticatedApp);
    try {
      const url = `http://127.0.0.1:${authenticatedServer.address().port}/api/funds/maintenance/10000000-0000-4000-8000-000000000001/payment-approval`;
      for (let i = 0; i < 240; i++) {
        const response = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer valid', 'x-org-id': 'a0000000-0000-4000-8000-000000000001', 'content-type': 'application/json' }, body: '{}' });
        assert.equal(response.status, 404, `authenticated request ${i + 1} unexpectedly rate limited`);
      }
      const limited = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer valid', 'x-org-id': 'a0000000-0000-4000-8000-000000000001', 'content-type': 'application/json' }, body: '{}' });
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).error.code, 'USER_RATE_LIMITED');
    } finally { await new Promise((resolve, reject) => authenticatedServer.close((error) => error ? reject(error) : resolve())); }

    const ipApp = createApp({ config: { ...baseConfig, hasSupabase: false, hasPayPal: false }, identity: null, repos: createRepositories(), paypal: { async pp() { throw new Error('unexpected PayPal call'); } } });
    const ipServer = await listen(ipApp);
    try {
      const url = `http://127.0.0.1:${ipServer.address().port}/api/funds/maintenance/10000000-0000-4000-8000-000000000001/payment`;
      for (let i = 0; i < 300; i++) {
        const response = await fetch(url, { method: 'POST' });
        assert.equal(response.status, 503, `IP request ${i + 1} unexpectedly rate limited`);
      }
      const limited = await fetch(url, { method: 'POST' });
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).error.code, 'RATE_LIMITED');
    } finally { await new Promise((resolve, reject) => ipServer.close((error) => error ? reject(error) : resolve())); }
  } finally { console.log = originalLog; }
});
