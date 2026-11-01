import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const authSource = readFileSync(new URL('../../src/auth.js', import.meta.url), 'utf8');
const documentsSource = readFileSync(new URL('../../src/documents.js', import.meta.url), 'utf8');

function makeSession(id = 'existing-owner') {
  return { access_token: 'test-access-token', user: { id, email: 'owner@example.test', user_metadata: { full_name: 'Existing Owner' } } };
}

function authHarness({ session = null, loginSession = makeSession(), duplicate = false, otpError = null, signInError = null, emptyWorkspace = false, freshWorkspace = false } = {}) {
  const calls = [];
  const stored = new Map();
  const sessionStored = new Map();
  if (freshWorkspace) {
    stored.set('novapay-org-id:existing-owner', 'org-existing');
    sessionStored.set('novapay-workspace-checked:existing-owner', JSON.stringify({ orgId: 'org-existing', checkedAt: Date.now() }));
  }
  const authClient = {
    async getSession() { return { data: { session }, error: null }; },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
    async signInWithPassword() { return signInError ? { data: { session: null }, error: signInError } : { data: { session: loginSession }, error: null }; },
    async signUp(args) { calls.push({ op: 'signUp', email: args.email }); return { data: { user: { id: 'new-user', email: args.email, identities: duplicate ? [] : [{ provider: 'email' }] }, session: null }, error: null }; },
    async verifyOtp(args) { calls.push({ op: 'verifyOtp', type: args.type, tokenLength: args.token.length }); return otpError ? { data: {}, error: otpError } : { data: { session: loginSession, user: loginSession.user }, error: null }; },
    async resend(args) { calls.push({ op: 'resend', type: args.type, email: args.email }); return { data: {}, error: null }; },
    async resetPasswordForEmail(email) { calls.push({ op: 'resetPasswordForEmail', email }); return { data: {}, error: null }; },
    async updateUser() { calls.push({ op: 'updateUser' }); return { data: { user: loginSession.user }, error: null }; },
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
  const sessionStorage = {
    getItem(key) { return sessionStored.has(key) ? sessionStored.get(key) : null; },
    setItem(key, value) { sessionStored.set(key, String(value)); },
    removeItem(key) { sessionStored.delete(key); },
  };
  const fetch = async (path, options = {}) => {
    if (path === '/api/public-config') return { ok: true, async json() { return { supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'public-test-key' }; } };
    if (path === '/api/onboarding' && options.method !== 'POST') { calls.push({ path, method: 'GET' }); return { ok: true, async json() { return { organizations: emptyWorkspace ? [] : [{ organizationId: 'org-existing', role: 'owner' }] }; } }; }
    if (path === '/api/onboarding') {
      calls.push({ path, body: JSON.parse(options.body) });
      return { ok: true, async json() { return { organizationId: 'org-existing', created: false }; } };
    }
    if (path.startsWith('/api/auth/preflight?')) { calls.push({ op: 'preflight', flow: new URLSearchParams(path.split('?')[1]).get('flow') }); return { ok: true, async json() { return { allowed: true }; } }; }
    throw new Error('Unexpected test request');
  };
  runInNewContext(authSource, { window, document, localStorage, sessionStorage, fetch, URLSearchParams, CustomEvent: class {}, AbortController, setTimeout, clearTimeout, console });
  return { auth: window.NovaPayAuth, calls, stored, sessionStored };
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
  assert.equal(auth.emailActionErrorMessage({ code: 'otp_expired' }), 'That code expired. Request a new code and try again.');
  assert.equal(auth.emailActionErrorMessage({ code: 'otp_invalid' }), 'That verification code is incorrect. Check it and try again.');
  assert.equal(auth.emailActionErrorMessage({ status: 429 }), 'Too many attempts. Wait before trying again.');
  assert.match(auth.emailActionErrorMessage({ code: 'DISPOSABLE_EMAIL_BLOCKED' }), /non-disposable/);
});

test('successful Supabase login restores an existing owner workspace before returning', async () => {
  const session = makeSession();
  const { auth, calls } = authHarness({ loginSession: session });
  await auth.ready;
  await auth.signIn(session.user.email, 'test-password');
  assert.equal(auth.currentOrgId(session.user.id), 'org-existing');
  assert.equal(calls.filter((call) => call.path === '/api/onboarding' && call.method === 'GET').length, 1);
  assert.equal(calls.filter((call) => call.op === 'signUp').length, 0);
});

test('unconfirmed Supabase login is rejected before workspace onboarding', async () => {
  const { auth, calls } = authHarness({ signInError: { code: 'email_not_confirmed', message: 'Email not confirmed' } }); await auth.ready;
  await assert.rejects(auth.signIn('person@example.test', 'test-password'), (error) => error.code === 'email_not_confirmed');
  assert.equal(calls.some((call) => call.path === '/api/onboarding'), false);
});

test('confirmed account without a membership can create one workspace through onboarding', async () => {
  const { auth, calls } = authHarness({ emptyWorkspace: true }); await auth.ready;
  const session = await auth.signIn('owner@example.test', 'test-password');
  assert.equal(session.user.id, 'existing-owner');
  assert.equal(calls.filter((call) => call.path === '/api/onboarding' && call.body).length, 1);
  assert.equal(auth.currentOrgId('existing-owner'), 'org-existing');
});

test('restored Supabase sessions restore their existing workspace before auth.ready resolves', async () => {
  const session = makeSession();
  const { auth, calls } = authHarness({ session });
  await auth.ready;
  assert.equal(auth.currentOrgId(session.user.id), 'org-existing');
  assert.equal(calls.filter((call) => call.path === '/api/onboarding' && call.method === 'GET').length, 1);
});

test('signup sends normalized Supabase signup then verifies OTP before restoring workspace', async () => {
  const { auth, calls, stored } = authHarness(); await auth.ready;
  await auth.signUp('New Person', ' New.Person@Example.Test ', 'a-long-test-password');
  assert.equal(stored.has('novapay-demo-accounts'), false);
  assert.equal(calls.find((call) => call.op === 'signUp').email, 'new.person@example.test');
  assert.equal(calls.some((call) => call.op === 'preflight' && call.flow === 'signup'), true);
  await auth.verifySignup('New.Person@Example.Test', '123456');
  assert.equal(calls.find((call) => call.op === 'verifyOtp').type, 'signup');
  assert.equal(calls.some((call) => call.op === 'preflight' && call.flow === 'verify'), true);
  assert.equal(auth.currentOrgId('existing-owner'), 'org-existing');
  assert.equal(calls.filter((call) => call.path === '/api/onboarding' && call.method === 'GET').length, 1);
  assert.equal(calls.filter((call) => call.path === '/api/onboarding' && call.body).length, 0);
});

test('wrong and expired OTP errors remain typed and no onboarding follows failed verification', async () => {
  for (const code of ['otp_expired', 'otp_disabled']) {
    const { auth, calls } = authHarness({ otpError: { code, message: code } }); await auth.ready;
    await assert.rejects(auth.verifySignup('person@example.test', '123456'), (error) => error.code === code);
    assert.equal(calls.some((call) => call.path === '/api/onboarding'), false);
  }
});

test('signup duplicate address is rejected by Supabase without a local account fallback', async () => {
  const { auth, stored } = authHarness({ duplicate: true }); await auth.ready;
  await assert.rejects(auth.signUp('Person', 'person@example.test', 'a-long-test-password'), (error) => error.code === 'USER_ALREADY_EXISTS');
  assert.equal(stored.has('novapay-demo-accounts'), false);
});

test('resend observes the app cooldown preflight and uses Supabase resend', async () => {
  const { auth, calls } = authHarness(); await auth.ready;
  await auth.resendSignup('Person@Example.Test');
  assert.equal(calls.find((call) => call.op === 'preflight').flow, 'resend');
  assert.equal(calls.find((call) => call.op === 'resend').type, 'signup');
});

test('password recovery sends, verifies recovery OTP, and updates password', async () => {
  const { auth, calls } = authHarness(); await auth.ready;
  await auth.resetPassword('Person@Example.Test');
  await auth.verifyRecovery('Person@Example.Test', '123456');
  await auth.updatePassword('a-new-long-password');
  assert.equal(calls.some((call) => call.op === 'resetPasswordForEmail'), true);
  assert.equal(calls.find((call) => call.op === 'verifyOtp').type, 'recovery');
  assert.equal(calls.some((call) => call.op === 'updateUser'), true);
});

test('email masking and OTP normalization handle valid, pasted, and malformed input', async () => {
  const { auth } = authHarness(); await auth.ready;
  assert.equal(auth.maskEmail('Alice@gmail.com'), 'a***@gmail.com');
  assert.equal(auth.normalizeOtp('12a 34567'), '123456');
  assert.equal(auth.normalizeOtp('paste 98-76'), '9876');
});

test('fresh OTP workspace verification skips a duplicate lookup after dashboard navigation', async () => {
  const { auth, calls } = authHarness({ session: makeSession(), freshWorkspace: true });
  await auth.ready;
  assert.equal(auth.currentOrgId('existing-owner'), 'org-existing');
  assert.equal(calls.filter((call) => call.path === '/api/onboarding').length, 0);
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
  assert.match(landing, /auth\.signUp\(/);
  assert.match(landing, /auth\.verifySignup\(/);
  assert.match(landing, /auth\.verifyRecovery\(/);
  assert.match(landing, /auth\.mode === "demo"/);
  assert.match(preview, /id="otp-panel"/);
  assert.match(preview, /autocomplete="one-time-code"/);
  assert.match(preview, /class="auth-demo" hidden/);
  assert.match(preview, /inputmode="numeric"/);
  assert.match(landing, /otpCode\.value\.length === 6/);
  assert.match(landing, /resendSeconds = 60/);
  assert.match(landing, /e\.preventDefault\(\); submitOtp\(\)/);
  assert.match(landing, /auth\.mode === "demo"/);
  assert.match(landing, /auth\.signUp\(/);
  assert.match(landing, /login-verify/);
  const workspaceDashboard = readFileSync(new URL('../../dashboard.html', import.meta.url), 'utf8');
  assert.match(workspaceDashboard, /id="workspace-required"/);
  assert.match(landing, /inlineError\("login-error"/);
  const guard = readFileSync(new URL('../../src/workspace-guard.js', import.meta.url), 'utf8');
  assert.match(guard, /auth\.ensureWorkspace\(session\)/);
  assert.match(guard, /workspace-required/);
});
