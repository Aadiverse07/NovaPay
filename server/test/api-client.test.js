import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('authenticated API client bypasses conditional HTTP caching', async () => {
  let requestOptions;
  const window = {
    NovaPayAuth: {
      ready: Promise.resolve(),
      async currentSession() { return { access_token: 'test-token', user: { id: 'user-a' } }; },
      currentOrgId() { return 'org-a'; },
    },
  };
  const context = {
    window,
    document: { dispatchEvent() {} },
    CustomEvent: class CustomEvent {},
    Headers,
    FormData,
    fetch: async (_path, options) => {
      requestOptions = options;
      return { ok: true, async json() { return { events: [], calls: [] }; } };
    },
  };
  const source = readFileSync(new URL('../../src/api-client.js', import.meta.url), 'utf8');
  runInNewContext(source, context);
  await window.NovaPayApi.request('/api/events');
  assert.equal(requestOptions.cache, 'no-store');
  assert.equal(requestOptions.headers.get('X-Org-Id'), 'org-a');
  await window.NovaPayApi.request('/api/events', { method: 'POST', body: { type: 'test' } });
  assert.equal(requestOptions.cache, 'no-store');
});

test('authenticated blob requests retain bearer and organization headers', async () => {
  let requestOptions;
  const blob = new Blob(['%PDF-test'], { type: 'application/pdf' });
  const window = { NovaPayAuth: { ready: Promise.resolve(), async currentSession() { return { access_token: 'blob-token', user: { id: 'viewer-a' } }; }, currentOrgId() { return 'org-a'; } } };
  const context = {
    window, document: { dispatchEvent() {} }, CustomEvent: class CustomEvent {}, Headers, FormData, Blob,
    fetch: async (_path, options) => { requestOptions = options; return { ok: true, async blob() { return blob; } }; },
  };
  const source = readFileSync(new URL('../../src/api-client.js', import.meta.url), 'utf8');
  runInNewContext(source, context);
  const result = await window.NovaPayApi.request('/api/invoices/invoice-a/download', { responseType: 'blob' });
  assert.equal(result, blob);
  assert.equal(requestOptions.headers.get('Authorization'), 'Bearer blob-token');
  assert.equal(requestOptions.headers.get('X-Org-Id'), 'org-a');
  assert.equal(requestOptions.method, 'GET');
});

function clientHarness(fetchImpl, timers = [], now = () => Date.now()) {
  const window = { NovaPayAuth: { ready: Promise.resolve(), async currentSession() { return { access_token: 'budget-token', user: { id: 'budget-user' } }; }, currentOrgId() { return 'budget-org'; } } };
  const context = {
    window, document: { dispatchEvent() {} }, CustomEvent: class CustomEvent {}, Headers, FormData, Blob,
    setTimeout(callback, ms) { timers.push(ms); callback(); return timers.length; },
    Date: { now, parse: Date.parse },
    fetch: fetchImpl,
  };
  runInNewContext(readFileSync(new URL('../../src/api-client.js', import.meta.url), 'utf8'), context);
  return window.NovaPayApi;
}

test('parallel module opens share GETs and stay within the 11-call page/module read budget', async () => {
  const fetched = [];
  const api = clientHarness(async (path) => {
    fetched.push(path);
    return { ok: true, async json() { return { path }; } };
  });
  const paths = [
    '/api/reports/profit-and-loss?from=a&to=b', '/api/reports/fees?from=a&to=b',
    '/api/reports/refunds?from=a&to=b', '/api/reports/cash-movement?from=a&to=b',
    '/api/transactions?limit=50&offset=0', '/api/ledger/entries', '/api/approvals?limit=100&offset=0',
    '/api/notifications?limit=50&offset=0', '/api/events', '/api/funds/campaigns', '/api/funds/maintenance',
  ];
  await Promise.all(paths.concat(paths).map((path) => api.request(path)));
  await Promise.all(paths.map((path) => api.request(path)));
  assert.equal(fetched.length, 11);
  assert.equal(Object.values(api.getRequestStats()).reduce((sum, count) => sum + count, 0), 11);
});

test('successful capture mutation invalidates only affected cached reads', async () => {
  const fetched = [];
  const api = clientHarness(async (path, options) => {
    fetched.push(path + ':' + options.method);
    return { ok: true, async json() { return { ok: true }; } };
  });
  await api.request('/api/transactions');
  await api.request('/api/ledger/entries');
  await api.request('/api/notifications');
  await api.request('/api/paypal/capture', { method: 'POST', body: { orderId: 'test' } });
  await api.request('/api/transactions');
  await api.request('/api/ledger/entries');
  await api.request('/api/notifications');
  assert.equal(fetched.filter((path) => path.startsWith('/api/transactions:')).length, 2);
  assert.equal(fetched.filter((path) => path.startsWith('/api/ledger/entries:')).length, 2);
  assert.equal(fetched.filter((path) => path.startsWith('/api/notifications:')).length, 1);
});

test('GET response cache expires after its short freshness window', async () => {
  let now = 1000, calls = 0;
  const api = clientHarness(async () => { calls += 1; return { ok: true, async json() { return { call: calls }; } }; }, [], () => now);
  await api.request('/api/transactions');
  now += 19999; await api.request('/api/transactions');
  assert.equal(calls, 1);
  now += 2; await api.request('/api/transactions');
  assert.equal(calls, 2);
});

test('GET rate-limit retry honors short Retry-After and prevents tight retries for longer limits', async () => {
  const delays = [], fetched = [];
  let shortCalls = 0;
  const api = clientHarness(async (path) => {
    fetched.push(path);
    if (path === '/api/short' && shortCalls++ === 0) return { ok: false, status: 429, headers: { get(name) { return name === 'Retry-After' ? '2' : null; } }, async json() { return { error: { code: 'RATE_LIMITED', message: 'Wait' } }; } };
    if (path === '/api/long') return { ok: false, status: 429, headers: { get(name) { return name === 'Retry-After' ? '60' : null; } }, async json() { return { error: { code: 'RATE_LIMITED', message: 'Wait' } }; } };
    return { ok: true, async json() { return { ok: true }; } };
  }, delays);
  await api.request('/api/short');
  assert.deepEqual(delays, [2000]);
  await assert.rejects(api.request('/api/long'), (error) => error.status === 429 && error.retryAfterMs === 60000);
  const before = fetched.length;
  await assert.rejects(api.request('/api/long'), (error) => error.status === 429 && error.retryAfterMs > 0);
  assert.equal(fetched.length, before);
});
