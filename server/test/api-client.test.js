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
