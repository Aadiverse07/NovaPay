import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const orgA = 'a0000000-0000-4000-8000-000000000001';
const orgB = 'b0000000-0000-4000-8000-000000000002';
const config = {
  PORT: 3000, STATIC_DIR: process.cwd(), hasSupabase: true,
  SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon-visible', SUPABASE_SERVICE_ROLE_KEY: 'server-only-secret',
  hasPayPal: false, hasAI: false, PAYPAL_WEBHOOK_ID: '',
};

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

function authFetch(base, path, { token = 'valid-token', orgId = orgA, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('authorization', `Bearer ${token}`);
  if (orgId) headers.set('x-org-id', orgId);
  if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(`${base}${path}`, { ...options, headers });
}

test('auth requires a valid Supabase JWT and blocks cross-organization requests', async () => {
  const identity = {
    async verifyToken(token) { return token === 'valid-token' ? { id: 'user-a' } : null; },
    async membership(userId, orgId) { return userId === 'user-a' && orgId === orgA ? { role: 'viewer' } : null; },
  };
  const app = createApp({ config, identity });
  await withServer(app, async (base) => {
    const missing = await authFetch(base, '/api/events', { token: null });
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), { error: { code: 'AUTH_REQUIRED', message: 'A valid Supabase bearer token is required.' } });
    const invalid = await authFetch(base, '/api/events', { token: 'bad-token' });
    assert.equal(invalid.status, 401);
    const foreign = await authFetch(base, '/api/events', { orgId: orgB });
    assert.equal(foreign.status, 403);
    assert.deepEqual((await foreign.json()).error.code, 'ORG_FORBIDDEN');
    const invalidOrg = await authFetch(base, '/api/events', { orgId: 'not-a-uuid' });
    assert.equal(invalidOrg.status, 400);
    assert.deepEqual((await invalidOrg.json()).error.code, 'ORG_HEADER_REQUIRED');
  });
});

test('every protected route rejects a missing bearer token', async () => {
  const identity = { async verifyToken() { return null; }, async membership() { return null; } };
  const app = createApp({ config, identity });
  const requests = [
    ['/api/events', {}], ['/api/ai/chat', { method: 'POST', body: '{}' }],
    ['/api/approvals/register', { method: 'POST', body: '{}' }],
    ['/api/paypal/create-order', { method: 'POST', body: '{}' }],
    ['/api/paypal/capture', { method: 'POST', body: '{}' }],
    ['/api/paypal/refund', { method: 'POST', body: '{}' }],
    ['/api/onboarding', { method: 'POST', body: '{}' }],
  ];
  await withServer(app, async (base) => {
    for (const [path, options] of requests) {
      const response = await authFetch(base, path, { ...options, token: null });
      assert.equal(response.status, 401, path);
      assert.equal((await response.json()).error.code, 'AUTH_REQUIRED', path);
    }
  });
});

test('unauthenticated malformed API JSON is rejected before body parsing', async () => {
  const identity = { async verifyToken() { throw new Error('must not verify without bearer token'); }, async membership() { return null; } };
  const app = createApp({ config, identity });
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/api/paypal/create-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: { code: 'AUTH_REQUIRED', message: 'A valid Supabase bearer token is required.' } });
  });
});

test('viewer cannot register an approval and new routes use structured error envelopes', async () => {
  const identity = {
    async verifyToken() { return { id: 'viewer' }; },
    async membership() { return { role: 'viewer' }; },
  };
  const app = createApp({ config, identity });
  await withServer(app, async (base) => {
    const response = await authFetch(base, '/api/approvals/register', { method: 'POST', body: JSON.stringify({}) });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: { code: 'ROLE_FORBIDDEN', message: 'Your organization role cannot perform this action.' } });
    const order = await authFetch(base, '/api/paypal/create-order', { method: 'POST', body: JSON.stringify({ amount: '10.00', currency: 'USD', requestKey: '0123456789abcdef0123456789abcdef' }) });
    assert.equal(order.status, 403);
    assert.equal((await order.json()).error.code, 'ROLE_FORBIDDEN');
    for (const path of ['/api/paypal/capture', '/api/paypal/refund']) {
      const response = await authFetch(base, path, { method: 'POST', body: JSON.stringify({}) });
      assert.equal(response.status, 403, path);
      assert.equal((await response.json()).error.code, 'ROLE_FORBIDDEN', path);
    }
  });
});

test('public config contains only Supabase URL and anon key, and onboarding is authenticated and repeat-safe', async () => {
  let calls = 0;
  const identity = {
    async verifyToken(token) { return token === 'valid-token' ? { id: 'user-a' } : null; },
    async membership() { return { role: 'owner' }; },
    async onboard() { calls += 1; return { organizationId: orgA, created: calls === 1 }; },
  };
  const app = createApp({ config, identity });
  await withServer(app, async (base) => {
    const publicConfigResponse = await fetch(`${base}/api/public-config`);
    const publicConfigText = await publicConfigResponse.text();
    assert.deepEqual(JSON.parse(publicConfigText), { supabaseUrl: config.SUPABASE_URL, supabaseAnonKey: config.SUPABASE_ANON_KEY });
    assert.equal(publicConfigText.includes(config.SUPABASE_SERVICE_ROLE_KEY), false);
    const invalid = await authFetch(base, '/api/onboarding', { orgId: null, method: 'POST', body: JSON.stringify({ organizationName: 'x' }) });
    assert.equal(invalid.status, 400);
    assert.deepEqual((await invalid.json()).error.code, 'VALIDATION_ERROR');
    const malformed = await fetch(`${base}/api/onboarding`, { method: 'POST', headers: { authorization: 'Bearer valid-token', 'content-type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
    assert.deepEqual((await malformed.json()).error, { code: 'BAD_JSON', message: 'Request body must be valid JSON.' });
    const first = await authFetch(base, '/api/onboarding', { orgId: null, method: 'POST', body: JSON.stringify({ organizationName: 'Example org' }) });
    assert.equal(first.status, 201);
    const firstBody = await first.json();
    assert.deepEqual(firstBody, { organizationId: orgA, role: 'owner', created: true });
    const repeated = await authFetch(base, '/api/onboarding', { orgId: null, method: 'POST', body: JSON.stringify({ organizationName: 'Example org' }) });
    assert.equal(repeated.status, 200);
    assert.deepEqual(await repeated.json(), { organizationId: orgA, role: 'owner', created: false });
    assert.equal(calls, 2);
  });
});

test('degraded mode is explicit and protected API calls do not bypass authentication', async () => {
  const app = createApp({ config: { ...config, hasSupabase: false }, identity: null });
  await withServer(app, async (base) => {
    const status = await (await fetch(`${base}/api/status`)).json();
    assert.equal(status.mode, 'degraded');
    assert.equal(status.supabaseConfigured, false);
    const protectedResponse = await fetch(`${base}/api/events`);
    assert.equal(protectedResponse.status, 503);
    assert.deepEqual((await protectedResponse.json()).error.code, 'SUPABASE_NOT_CONFIGURED');
  });
});

test('request query values and provider secrets do not appear in server logs', async () => {
  const identity = { async verifyToken() { return { id: 'user-a' }; }, async membership() { return { role: 'viewer' }; } };
  const app = createApp({ config, identity });
  const originalLog = console.log;
  const logs = [];
  console.log = (line) => logs.push(String(line));
  try {
    await withServer(app, async (base) => { await authFetch(base, '/api/events?token=sentinel-query-secret'); });
  } finally { console.log = originalLog; }
  assert.equal(logs.join('\n').includes('sentinel-query-secret'), false);
  assert.equal(logs.join('\n').includes(config.SUPABASE_SERVICE_ROLE_KEY), false);
  assert.equal(logs.some((line) => line.includes('"path":"/api/events"')), true);
});
