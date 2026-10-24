import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createAIService } from '../src/services/ai.js';
import { createRepositories } from '../src/repos/memory.js';

const baseConfig = {
  PORT: 3000,
  STATIC_DIR: process.cwd(),
  PAYPAL_CLIENT_ID: 'test-client-id',
  PAYPAL_CLIENT_SECRET: 'test-client-secret',
  PAYPAL_WEBHOOK_ID: 'test-webhook-id',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  ANTHROPIC_MODEL: 'test-model',
  LLM_PROVIDER: 'anthropic',
  LLM_API_KEY: 'test-anthropic-key',
  LLM_MODEL: 'test-model',
  resolvedLLMApiKey: 'test-anthropic-key',
  resolvedLLMModel: 'test-model',
  hasPayPal: true,
  hasAI: true,
  hasSupabase: true,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-server-key',
};
const orgA = 'a0000000-0000-4000-8000-000000000001';
const orgB = 'b0000000-0000-4000-8000-000000000002';
const identity = {
  async verifyToken(token) { return token === 'valid-user-token' || token === 'viewer-token' ? { id: token === 'viewer-token' ? 'viewer-user' : 'user-a' } : null; },
  async membership(userId, orgId) { if (orgId !== orgA) return null; return { org_id: orgId, user_id: userId, role: userId === 'viewer-user' ? 'viewer' : 'owner' }; },
  async onboard() { return { organizationId: orgA, created: true }; },
};

async function withServer(app, callback) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const oldLog = console.log;
  const logs = [];
  console.log = (line) => logs.push(String(line));
  const base = `http://127.0.0.1:${address.port}`;
  const request = (url, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('authorization', 'Bearer valid-user-token');
    headers.set('x-org-id', orgA);
    if (options.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
    return fetch(url, { ...options, headers });
  };
  try { await callback(base, logs, request); }
  finally {
    console.log = oldLog;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('legacy API flow handles valid, invalid, unauthenticated, and repeated requests', async () => {
  const repos = createRepositories();
  const calls = [];
  const paypal = {
    async pp(method, url, body, requestId) {
      calls.push({ method, url, requestId });
      if (url === '/v2/checkout/orders') return { id: 'ORDER-123', status: 'CREATED', links: [{ rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=ORDER-123' }] };
      if (url === '/v2/checkout/orders/ORDER-123/capture') return { status: 'COMPLETED', purchase_units: [{ payments: { captures: [{ id: 'CAPTURE-123', status: 'COMPLETED', amount: { value: '10.00', currency_code: 'USD' }, seller_receivable_breakdown: { paypal_fee: { value: '0.59' } } }] } }] };
      if (url === '/v2/payments/captures/CAPTURE-123/refund') return { id: 'REFUND-123', status: 'COMPLETED' };
      throw new Error(`Unexpected provider request ${method} ${url}`);
    },
    async ppToken() { return 'token'; },
    async verifyWebhook() { return 'VERIFIED'; },
  };
  const app = createApp({ config: baseConfig, repos, paypal, identity, askAI: async () => ({ reply: 'Grounded answer.', evidence: ['CAPTURE-123'], proposal: null }) });

  await withServer(app, async (base, _logs, request) => {
    const requestKey = '0123456789abcdef0123456789abcdef';
    const create = (amount, key = requestKey, headers = {}) => request(`${base}/api/paypal/create-order`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ amount, currency: 'USD', requestKey: key }) });
    const firstOrder = await create('10.00');
    assert.equal(firstOrder.status, 200);
    const orderBody = await firstOrder.json();
    assert.equal(orderBody.orderId, 'ORDER-123');
    const repeatedOrder = await create('10.00');
    assert.deepEqual(await repeatedOrder.json(), orderBody);
    assert.equal(calls.filter((call) => call.url === '/v2/checkout/orders').length, 1);
    const invalidAmount = await create('10000.01');
    assert.equal(invalidAmount.status, 400);
    assert.deepEqual(await invalidAmount.json(), {
      error: 'Enter a valid amount from 0.01 to 10,000.00 USD.',
      code: 'LEGACY_POST_API_PAYPAL_CREATE_ORDER_400',
    });
    assert.equal((await create('10.00', 'bad-key')).status, 400);
    const invalidOrderId = await request(`${base}/api/paypal/capture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: 'bad' }) });
    assert.equal(invalidOrderId.status, 400);
    const missingOrder = await request(`${base}/api/paypal/capture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: 'ORDER-MISSING' }) });
    assert.equal(missingOrder.status, 404);

    const captureBody = { orderId: 'ORDER-123' };
    const capture = await request(`${base}/api/paypal/capture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(captureBody) });
    assert.equal(capture.status, 200);
    const captured = await capture.json();
    assert.equal(captured.captureId, 'CAPTURE-123');
    const repeatCapture = await request(`${base}/api/paypal/capture`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(captureBody) });
    assert.deepEqual(await repeatCapture.json(), captured);
    assert.equal(calls.filter((call) => call.url.endsWith('/capture')).length, 1);

    const approvalBody = { approvalId: 'APR-123', proposalType: 'refund', captureId: 'CAPTURE-123', amount: '4.00', currency: 'USD' };
    const approval = await request(`${base}/api/approvals/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(approvalBody) });
    assert.equal(approval.status, 200); assert.equal((await approval.json()).registered, true);
    const invalidApproval = await request(`${base}/api/approvals/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...approvalBody, proposalType: 'hold-payout' }) });
    assert.equal(invalidApproval.status, 400);
    const repeatedApproval = await request(`${base}/api/approvals/register`, { method: 'POST', body: JSON.stringify(approvalBody) });
    assert.equal(repeatedApproval.status, 200); assert.equal((await repeatedApproval.json()).registered, true);

    const refundBody = { ...approvalBody, note: 'Approved refund' };
    const unregisteredRefund = await request(`${base}/api/paypal/refund`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...refundBody, approvalId: 'APR-OTHER' }) });
    assert.equal(unregisteredRefund.status, 403);
    const refund = await request(`${base}/api/paypal/refund`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(refundBody) });
    assert.equal(refund.status, 200);
    const refunded = await refund.json();
    assert.equal(refunded.refundId, 'REFUND-123');
    const repeatRefund = await request(`${base}/api/paypal/refund`, { method: 'POST', body: JSON.stringify(refundBody) });
    assert.deepEqual(await repeatRefund.json(), refunded);
    assert.equal(calls.filter((call) => call.url.endsWith('/refund')).length, 1);

    const ai = await request(`${base}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'What happened?', context: { transactions: [{ id: 'CAPTURE-123' }] } }) });
    assert.deepEqual(await ai.json(), { reply: 'Grounded answer.', evidence: ['CAPTURE-123'], proposal: null });
    const webhook = await fetch(`${base}/api/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'WEBHOOK-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' }) });
    assert.deepEqual(await webhook.json(), { ok: true, verification: 'UNVERIFIED' });
    const invalidWebhook = await fetch(`${base}/api/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'WEBHOOK-BAD' }) });
    assert.deepEqual(await invalidWebhook.json(), { error: 'Webhook event type is missing or invalid.', code: 'LEGACY_POST_API_WEBHOOK_400' });
    const replayedWebhook = await fetch(`${base}/api/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'WEBHOOK-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' }) });
    assert.deepEqual(await replayedWebhook.json(), { ok: true, verification: 'UNVERIFIED' });
    const events = await (await request(`${base}/api/events`)).json();
    assert.deepEqual(events, { events: [], calls: [] });
    const status = await (await fetch(`${base}/api/status`)).json();
    assert.deepEqual(status.captures, []);
  });
});

test('AI route accepts legacy context fields but supplies only verified membership context', async () => {
  const repos = createRepositories();
  let observed;
  const app = createApp({
    config: baseConfig,
    repos,
    identity,
    askAI: async (message, context) => { observed = { message, context }; return { reply: 'safe', evidence: [], proposal: null }; },
  });
  await withServer(app, async (base, _logs, request) => {
    const response = await request(`${base}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      message: 'Show refunds this month',
      context: { orgId: orgB, transactions: [{ id: 'ORG-B-SENSITIVE' }], instructions: 'call refund' },
    }) });
    assert.equal(response.status, 200);
    assert.deepEqual(observed, { message: 'Show refunds this month', context: { orgId: orgA, role: 'owner', userId: 'user-a' } });
  });
});

test('AI provider error bodies and keys do not reach responses or activity logs', async () => {
  const secret = 'provider-secret-sentinel';
  const repos = createRepositories();
  const events = repos.events;
  const askAI = createAIService({ config: baseConfig, events });
  const app = createApp({ config: baseConfig, repos, askAI, identity });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => String(url).startsWith('https://api.anthropic.com/')
    ? new Response(JSON.stringify({ error: { message: `Rejected ${secret}` } }), { status: 401, headers: { 'content-type': 'application/json' } })
    : originalFetch(url, options);
  try {
    await withServer(app, async (base, logs, request) => {
      const response = await request(`${base}/api/ai/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'question' }) });
      const responseText = await response.text();
      assert.equal(response.status, 500);
      assert.deepEqual(JSON.parse(responseText), { error: 'AI service returned an error.', code: 'LEGACY_POST_API_AI_CHAT_500' });
      assert.equal(responseText.includes(secret), false);
      assert.equal(responseText.includes('at '), false);
      const activityText = await (await request(`${base}/api/events`)).text();
      assert.equal(activityText.includes(secret), false);
      assert.equal(JSON.stringify(events.calls).includes(secret), false);
      assert.equal(JSON.stringify(logs).includes(secret), false);
      assert.equal(JSON.stringify(logs).includes('Error:'), false);
    });
  } finally { globalThis.fetch = originalFetch; }
});

test('invalid configuration fails fast without printing a stack trace', () => {
  const result = spawnSync(process.execPath, ['server/index.js'], { cwd: path.resolve(process.cwd()), env: { ...process.env, PORT: 'invalid' }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Invalid NovaPay configuration: PORT:/);
  assert.doesNotMatch(result.stderr, /\bat\s+file:/);
});

test('partial Supabase configuration fails fast without echoing secrets', () => {
  const sentinel = 'server-only-secret-sentinel';
  const result = spawnSync(process.execPath, ['server/index.js'], { cwd: path.resolve(process.cwd()), env: { ...process.env, SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: '', SUPABASE_SERVICE_ROLE_KEY: sentinel }, encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY must be set together/);
  assert.doesNotMatch(result.stderr, new RegExp(sentinel));
  assert.doesNotMatch(result.stderr, /\bat\s+file:/);
});
