import test from 'node:test';
import assert from 'node:assert/strict';
import { hashNetwork, networkPrefix } from '../src/services/accountRisk.js';
import { recordSecuritySession } from '../src/services/security.js';
import { createRepositories } from '../src/repos/memory.js';

test('network fingerprints hash only coarse prefixes and normalize private networks', () => {
  assert.deepEqual(networkPrefix('8.8.8.42'),{prefix:'8.8.8.0/24',label:'IPv4 network 8.8.8.0/24'});
  assert.equal(networkPrefix('10.1.2.3').prefix,'local');
  assert.equal(networkPrefix('::1').prefix,'local');
  assert.equal(networkPrefix('2001:4860:1234:abcd::1').prefix,'2001:4860:1234::/48');
  const fingerprint=hashNetwork('8.8.8.42','test-security-salt');
  assert.match(fingerprint.ipHash,/^[a-f0-9]{64}$/);
  assert.equal(fingerprint.ipHash.includes('8.8.8.42'),false);
});

test('session starts persist hashed signals, upsert devices and ignore first-device novelty', async () => {
  const repos=createRepositories(), audits=[];
  const identity={audit:async(entry)=>audits.push(entry)};
  const config={SECURITY_HASH_SALT:'test-security-salt',SECURITY_RISK_WEIGHT_NEW_DEVICE:35,SECURITY_RISK_WEIGHT_NEW_NETWORK:20,SECURITY_RISK_MEDIUM_THRESHOLD:35,SECURITY_RISK_HIGH_THRESHOLD:70};
  const makeReq=(deviceId,ip='8.8.8.42')=>({body:{deviceId},user:{id:'user-a'},orgId:'org-a',id:'request-a',ip,get:()=> 'Example Browser'});
  const first=await recordSecuritySession({req:makeReq('11111111-1111-4111-8111-111111111111'),repos,config,identity,now:new Date('2026-11-09T00:00:00Z')});
  assert.equal(first.newDevice,false);assert.equal(first.risk.level,'low');
  const second=await recordSecuritySession({req:makeReq('22222222-2222-4222-8222-222222222222'),repos,config,identity,now:new Date('2026-11-09T00:01:00Z')});
  assert.equal(second.newDevice,true);assert.equal(second.risk.level,'medium');
  const rows=await repos.security.listLogins('org-a','user-a');
  assert.equal(rows.length,2);assert.equal(rows[0].network_label,'IPv4 network 8.8.8.0/24');
  assert.notEqual(rows[0].ip_hash,'8.8.8.42');assert.match(rows[0].user_agent_hash,/^[a-f0-9]{64}$/);
  assert.equal((await repos.security.listDevices('org-a','user-a')).length,2);assert.equal(audits.length,3);
  assert.equal((await repos.notifications.list('org-a','user-a')).length,1);
  assert.equal((await repos.notifications.list('org-a','user-b')).length,0);
});
