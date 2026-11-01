import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const authSource = readFileSync(new URL('../../src/auth.js', import.meta.url), 'utf8');
const documentsSource = readFileSync(new URL('../../src/documents.js', import.meta.url), 'utf8');

function makeSession(id = 'existing-owner') {
  return { access_token: 'test-access-token', user: { id, email: 'owner@example.test', user_metadata: { full_name: 'Existing Owner' } } };
}

function authHarness({ session = null, loginSession = makeSession(), onboarding = { organizationId: 'org-existing', created: false } } = {}) {
  const calls = [];
  const stored = new Map();
  const authClient = {
    async getSession() { return { data: { session }, error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithPassword() { return { data: { session: loginSession }, error: null }; },
  };
  const window = {
    location: { origin: 'https://novapay.test' },
    supabase: { createClient() { return { auth: authClient }; } },
    setTimeout,
    clearTimeout,
  };
  const document = { querySelectorAll() { return []; }, dispatchEvent() {} };
  const localStorage = {
    getItem(key) { return stored.has(key) ? stored.get(key) : null; },
    setItem(key, value) { stored.set(key, String(value)); },
    removeItem(key) { stored.delete(key); },
  };
  const fetch = async (path, options = {}) => {
    if (path === '/api/public-config') return { ok: true, async json() { return { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'public-test-key' }; } };
    if (path === '/api/onboarding') {
      calls.push({ path, body: JSON.parse(options.body) });
      return { ok: true, async json() { return onboarding; } };
    }
    throw new Error('Unexpected test request');
  };
  runInNewContext(authSource, { window, document, localStorage, fetch, CustomEvent: class {}, AbortController, setTimeout, clearTimeout, console });
  return { auth: window.NovaPayAuth, calls, stored };
}

function fakeNode() {
  return {
    children: [], handlers: {}, files: [], textContent: '', className: '', dataset: {},
    addEventListener(type, callback) { this.handlers[type] = callback; },
    appendChild(node) { this.children.push(node); return node; },
    replaceChildren(...nodes) { this.children = nodes; },
    setAttribute() {},
    querySelector() { return null; },
  };
}

test('login errors map to invalid credentials, unconfirmed email, rate limit, or network/config categories', async () => {
  const { auth } = authHarness();
  await auth.ready;
  assert.equal(auth.loginErrorCategory({ code: 'invalid_credentials', message: 'Invalid login credentials' }), 'invalid_credentials');
  assert.equal(auth.loginErrorCategory({ code: 'email_not_confirmed', message: 'Email not confirmed' }), 'email_not_confirmed');
  assert.equal(auth.loginErrorCategory({ status: 429, code: 'over_request_rate_limit' }), 'rate_limited');
  assert.equal(auth.loginErrorCategory({ name: 'TypeError', message: 'Failed to fetch' }), 'network_config');
  assert.equal(auth.loginErrorMessage({ code: 'invalid_credentials' }), 'Email or password is incorrect.');
});

test('successful Supabase login restores an existing owner workspace before returning', async () => {
  const session = makeSession();
  const { auth, calls } = authHarness({ loginSession: session });
  await auth.ready;
  await auth.signIn(session.user.email, 'test-password');
  assert.equal(auth.currentOrgId(session.user.id), 'org-existing');
  assert.equal(calls.filter((call) => call.path === '/api/onboarding').length, 1);
  assert.equal(calls[0].body.organizationName, 'Existing Owner Workspace');
});

test('restored Supabase sessions restore their existing workspace before auth.ready resolves', async () => {
  const session = makeSession();
  const { auth, calls } = authHarness({ session });
  await auth.ready;
  assert.equal(auth.currentOrgId(session.user.id), 'org-existing');
  assert.equal(calls.filter((call) => call.path === '/api/onboarding').length, 1);
});

test('Documents reloads role after an auth change before allowing an owner upload', async () => {
  const nodes = new Map();
  const listeners = {};
  const calls = [];
  let documentReads = 0;
  const fileInput = fakeNode();
  nodes.set('document-upload', fileInput);
  const document = {
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, fakeNode()); return nodes.get(id); },
    createElement() { return fakeNode(); },
    querySelector() { return null; },
  };
  const api = { async request(path, options = {}) {
    calls.push({ path, method: options.method || 'GET' });
    if (path === '/api/documents' && !options.method) return { documents: [], role: ++documentReads === 1 ? 'viewer' : 'owner' };
    if (path === '/api/documents' && options.method === 'POST') return { document: { id: 'doc-1' } };
    if (path.endsWith('/process')) return { ok: true };
    throw new Error('Unexpected Documents test request');
  } };
  runInNewContext(documentsSource, { window: { NovaPayApi: api, NovaPayAuth: { ready: Promise.resolve() } }, document, console });
  listeners.DOMContentLoaded[0]();
  await new Promise((resolve) => setTimeout(resolve, 0));
  listeners['novapay:auth'][0]({ detail: { signedIn: true } });
  await new Promise((resolve) => setTimeout(resolve, 0));
  fileInput.files = [{ name: 'sample.pdf', type: 'application/pdf' }];
  await fileInput.handlers.change();
  assert.equal(calls.some((call) => call.path === '/api/documents' && call.method === 'POST'), true);
  assert.notEqual(nodes.get('documents-live-status').textContent, 'Upload requires an owner, admin or accountant role.');
});

test('preview and dashboard load the pinned Supabase SDK and auth modules before their UI handlers', () => {
  const preview = readFileSync(new URL('../../preview.html', import.meta.url), 'utf8');
  const dashboard = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
  const landing = readFileSync(new URL('../../src/landing.js', import.meta.url), 'utf8');
  assert.ok(preview.indexOf('@supabase/supabase-js@2.112.3') < preview.indexOf('src/auth.js'));
  assert.ok(preview.indexOf('src/auth.js') < preview.indexOf('src/landing.js'));
  assert.ok(dashboard.indexOf('@supabase/supabase-js@2.112.3') < dashboard.indexOf('src/auth.js'));
  assert.ok(dashboard.indexOf('src/auth.js') < dashboard.indexOf('src/api-client.js'));
  assert.ok(dashboard.indexOf('src/api-client.js') < dashboard.indexOf('src/documents.js'));
  assert.match(landing, /await auth\.signIn\(loginEmail\.value\.trim\(\)\.toLowerCase\(\), loginPass\.value\)/);
  assert.match(landing, /if \(auth\.mode !== "demo"\)/);
  assert.match(landing, /validateDemoLogin\(\);/);
});
