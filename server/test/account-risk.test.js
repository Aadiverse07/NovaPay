import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAccountRisk, createRequestBurstTracker, recentStepUp, requiresSensitiveStepUp, scoreAccountRisk } from '../src/services/accountRisk.js';
import { LoginThrottle } from '../src/services/loginThrottle.js';
import { inspectSuspiciousMessage } from '../src/routes/security.js';

test('account risk scoring adds plain-language signals and caps at 100', () => {
  const config={SECURITY_RISK_WEIGHT_NEW_DEVICE:35,SECURITY_RISK_WEIGHT_NEW_NETWORK:20,SECURITY_RISK_WEIGHT_FAILED_LOGINS:20,SECURITY_RISK_WEIGHT_CREDENTIAL_CHANGE:25,SECURITY_RISK_WEIGHT_SENSITIVE_ACTION:20,SECURITY_RISK_WEIGHT_REQUEST_BURST:15,SECURITY_RISK_MEDIUM_THRESHOLD:35,SECURITY_RISK_HIGH_THRESHOLD:70};
  const risk = scoreAccountRisk({ newDevice: true, failedLogins: true, recentCredentialChange: true, requestBurst: true },config);
  assert.equal(risk.score, 95);
  assert.equal(risk.level, 'high');
  assert.equal(risk.reasons.length, 4);
  assert.match(risk.reasons[0], /device not seen before/);
});

test('each live account-risk signal contributes reasons and configured thresholds', async () => {
  const now=new Date('2026-11-09T00:10:00Z'), occurredAt='2026-11-09T00:05:00Z';
  const config={SECURITY_RISK_WEIGHT_NEW_DEVICE:30,SECURITY_RISK_WEIGHT_NEW_NETWORK:20,SECURITY_RISK_WEIGHT_FAILED_LOGINS:20,SECURITY_RISK_WEIGHT_CREDENTIAL_CHANGE:20,SECURITY_RISK_WEIGHT_SENSITIVE_ACTION:20,SECURITY_RISK_WEIGHT_REQUEST_BURST:15,SECURITY_RISK_MEDIUM_THRESHOLD:30,SECURITY_RISK_HIGH_THRESHOLD:70,SECURITY_CREDENTIAL_CHANGE_WINDOW_MINUTES:30,SECURITY_SENSITIVE_AFTER_NEW_DEVICE_MINUTES:15};
  const repos={security:{async listLogins(){return[{occurred_at:occurredAt,device_id:'device-a',risk_reasons:['A device not seen before signed in.','The sign-in came from a new network range.']}];},async failedLoginCount(){return 3;},async listDevices(){return[{device_id:'device-a'}];}}};
  const risk=await computeAccountRisk({repos,orgId:'org-a',userId:'user-a',config,user:{updatedAt:'2026-11-09T00:08:00Z'},requestBurst:true,sensitiveAction:true,now});
  assert.deepEqual(risk.signals,{newDevice:true,newIpRange:true,failedLogins:true,recentCredentialChange:true,sensitiveActionAfterNewDevice:true,requestBurst:true});
  assert.equal(risk.score,100);assert.equal(risk.level,'high');assert.equal(risk.reasons.length,6);
  assert.equal(scoreAccountRisk({newDevice:true},{...config,SECURITY_RISK_MEDIUM_THRESHOLD:30,SECURITY_RISK_HIGH_THRESHOLD:90}).level,'medium');
});

test('request burst tracker flags a real authenticated request burst in its time window',()=>{
  let now=0;const tracker=createRequestBurstTracker({windowMs:1000,threshold:3,now:()=>now});
  assert.equal(tracker.hit('u1').burst,false);now+=100;tracker.hit('u1');now+=100;assert.equal(tracker.hit('u1').burst,true);now+=1100;assert.equal(tracker.hit('u1').burst,false);
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
