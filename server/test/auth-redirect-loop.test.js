import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const dashboardJs = read('src/dashboard.js');
const dashboardHtml = read('dashboard.html');
const landingJs = read('src/landing.js');
const apiClientJs = read('src/api-client.js');

// Regression: after OTP sign-in the page ping-ponged between dashboard.html and preview.html#login
// because dashboard.js redirected on the demo-only "novapay-demo-auth" flag, which is never set in supabase mode.
test('dashboard.js never redirects to login from the demo-only localStorage flag', () => {
  assert.doesNotMatch(dashboardJs, /getItem\("novapay-demo-auth"\)\s*!==\s*"true"/);
  assert.doesNotMatch(dashboardJs, /location\.replace\("preview\.html#login"\);\s*return;/);
});

test('every redirect to preview.html#login records the bounce flag first (loop breaker)', () => {
  assert.match(dashboardHtml, /novapay-auth-bounce[\s\S]*preview\.html#login/);
  assert.match(apiClientJs, /novapay-auth-bounce[\s\S]*preview\.html#login/);
  // dashboard.js may only redirect to #login after ending the real session.
  for (const m of dashboardJs.matchAll(/location\.replace\("preview\.html#login"\)/g)) {
    const before = dashboardJs.slice(Math.max(0, m.index - 140), m.index);
    assert.match(before, /endSession\(\)\.then\(/, 'redirect to #login must follow endSession()');
  }
});

test('landing page does not send the user straight back to the dashboard after a bounce', () => {
  assert.match(landingJs, /novapay-auth-bounce/);
  assert.match(landingJs, /isAuthed\(\)\s*&&\s*!bounced/);
});

test('logout, inactivity and account deletion end the real Supabase session', () => {
  assert.match(dashboardJs, /function endSession\(\)/);
  assert.match(dashboardJs, /endSession\(\)\.then\(function\(\)\{window\.location\.href="preview\.html";\}\)/);
  assert.match(apiClientJs, /auth\.signOut\(\)\.then\(toLogin, toLogin\)/);
  assert.match(dashboardJs, /endSession\(\)\.then\(function\(\)\{window\.location\.href=\"preview\.html\";\}\)/);
});

test('demo auth storage redirect cannot run in Supabase mode', () => {
  assert.match(dashboardJs, /e\.key===\"novapay-demo-auth\"&&e\.newValue!==\"true\"&&window\.NovaPayAuth&&window\.NovaPayAuth\.mode===\"demo\"/);
});
