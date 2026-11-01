import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldLogAccess } from '../src/app.js';

test('successful static 304 revalidations are quiet while API revalidations and errors remain logged', () => {
  assert.equal(shouldLogAccess('/src/auth.js', 304), false);
  assert.equal(shouldLogAccess('/api/events', 304), true);
  assert.equal(shouldLogAccess('/assets/fonts/missing.woff2', 404), true);
  assert.equal(shouldLogAccess('/api/onboarding', 200), true);
});
