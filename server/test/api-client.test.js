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
