import test from 'node:test';
import assert from 'node:assert/strict';
import { recentStepUp, requiresSensitiveStepUp, scoreAccountRisk } from '../src/services/accountRisk.js';
import { LoginThrottle } from '../src/services/loginThrottle.js';
import { inspectSuspiciousMessage } from '../src/routes/security.js';

test('account risk scoring adds plain-language signals and caps at 100', () => {
  const risk = scoreAccountRisk({ newDevice: true, failedLogins: true, recentCredentialChange: true, requestBurst: true });
  assert.equal(risk.score, 90);
  assert.equal(risk.level, 'high');
  assert.equal(risk.reasons.length, 4);
  assert.match(risk.reasons[0], /device not seen before/);
});

test('suspicious message checks are deterministic and state their limits', () => {
  const result = inspectSuspiciousMessage('Urgent: send us your OTP immediately at https://example.test');
  assert.equal(result.suspicious, true);
  assert.equal(result.reasons.length, 3);
  assert.match(result.notice, /not a guarantee/);
});

test('step-up accepts only a recent verified authentication context', () => {
  const now = 1_800_000_000_000;
  assert.equal(recentStepUp({ aal: 'aal2', auth_time: now / 1000 - 60 }, now), true);
  assert.equal(recentStepUp({ aal: 'aal1', auth_time: now / 1000 - 900 }, now), false);
  assert.equal(requiresSensitiveStepUp({ riskLevel: 'high', newDevice: true, hasRecentStepUp: false }), true);
  assert.equal(requiresSensitiveStepUp({ riskLevel: 'high', hasRecentStepUp: true }), false);
});

test('login lockout backs off by account and IP with a generic response', () => {
  let clock = 0; const throttle = new LoginThrottle({ threshold: 2, baseDelayMs: 100, now: () => clock });
  throttle.fail('hashed-account','hashed-ip'); throttle.fail('hashed-account','hashed-ip');
  assert.equal(throttle.waitMs('hashed-account','another-ip'), 100);
  assert.match(throttle.fail('hashed-account','hashed-ip').message, /Sign-in could not be completed/);
});
