import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';

const org='a0000000-0000-4000-8000-000000000001',user='b0000000-0000-4000-8000-000000000002',device='c0000000-0000-4000-8000-000000000003',member='d0000000-0000-4000-8000-000000000004';
const config={PORT:3000,STATIC_DIR:process.cwd(),hasSupabase:true,SECURITY_HASH_SALT:'security-panel-test-salt',SECURITY_RISK_WEIGHT_NEW_DEVICE:35,SECURITY_RISK_MEDIUM_THRESHOLD:35,SECURITY_RISK_HIGH_THRESHOLD:70,SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'};
async function withServer(app,fn){const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));try{await fn(`http://127.0.0.1:${server.address().port}`)}finally{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}}
function request(base,path,{role='owner',method='GET'}={}){return fetch(base+path,{method,headers:{authorization:'Bearer valid-token','x-org-id':org}})}

test('security overview is scoped to the current user and device removal deletes its step-up grant',async()=>{
  const repos=createRepositories(),identity={async verifyToken(){return{id:user,email:'person@example.test'}},async membership(){return{role:'owner'}}};
  await repos.security.upsertDevice({org_id:org,user_id:user,device_id:device,last_seen:new Date().toISOString(),trusted:false});
  await repos.security.recordLogin({org_id:org,user_id:user,device_id:device,occurred_at:new Date().toISOString(),success:true,risk_score:45,risk_level:'medium',risk_reasons:['A device not seen before signed in.'],network_label:'IPv4 network 203.0.113.0/24'});
  await repos.security.grantStepUp({org_id:org,user_id:user,device_id:device,expires_at:new Date(Date.now()+60000).toISOString()});
  const app=createApp({config,identity,repos});
  await withServer(app,async base=>{
    const overview=await request(base,'/api/security/overview');assert.equal(overview.status,200);const data=await overview.json();assert.equal(data.risk.level,'medium');assert.equal(data.logins.length,1);assert.equal(data.devices[0].device_id,device);
    const removed=await request(base,`/api/security/devices/${device}`,{method:'DELETE'});assert.equal(removed.status,200);assert.equal(await repos.security.getDevice(org,user,device),null);assert.equal(await repos.security.hasStepUpGrant(org,user,device),false);
  });
});

test('member lock controls are role-gated and owner unlock audits the member action',async()=>{
  const repos=createRepositories(),audits=[];repos.security.listOrgMembers=async()=>[{user_id:member,role:'viewer'}];let removedHash='';repos.security.clearAccountLock=async hash=>{removedHash=hash;return 1};
  const identity={async verifyToken(){return{id:user,email:'owner@example.test'}},async membership(){return{role:'owner'}},async getUserById(id){return id===member?{id,email:'member@example.test'}:null},async audit(event){audits.push(event)}};
  const app=createApp({config,identity,repos});
  await withServer(app,async base=>{
    const members=await request(base,'/api/security/members');assert.equal(members.status,200);
    const unlock=await request(base,`/api/security/members/${member}/unlock`,{method:'POST'});assert.equal(unlock.status,200);assert.ok(removedHash);assert.equal(audits.at(-1).action,'security.login_unlocked');
  });
  const viewerApp=createApp({config,identity:{...identity,async membership(){return{role:'viewer'}}},repos});
  await withServer(viewerApp,async base=>{const denied=await request(base,'/api/security/members');assert.equal(denied.status,403)});
});

test('credential change records audit and revokes other device grants while preserving this device',async()=>{
 const repos=createRepositories(),other='e0000000-0000-4000-8000-000000000005',audits=[];const identity={async verifyToken(){return{id:user,email:'owner@example.test'}},async membership(){return{role:'owner'}},async audit(event){audits.push(event)}};
 await repos.security.upsertDevice({org_id:org,user_id:user,device_id:device,last_seen:new Date().toISOString()});await repos.security.upsertDevice({org_id:org,user_id:user,device_id:other,last_seen:new Date().toISOString()});
 for(const id of [device,other])await repos.security.grantStepUp({org_id:org,user_id:user,device_id:id,expires_at:new Date(Date.now()+60000).toISOString()});
 const app=createApp({config,identity,repos});await withServer(app,async base=>{const response=await fetch(base+'/api/security/credential-changed',{method:'POST',headers:{authorization:'Bearer valid-token','x-org-id':org,'content-type':'application/json'},body:JSON.stringify({deviceId:device})});assert.equal(response.status,200);assert.equal((await response.json()).revokedGrantCount,1)});
 assert.equal(await repos.security.hasStepUpGrant(org,user,device),true);assert.equal(await repos.security.hasStepUpGrant(org,user,other),false);assert.equal(audits.at(-1).action,'security.credential_changed');
});
