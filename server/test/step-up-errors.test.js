import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createRepositories } from '../src/repos/memory.js';

const org='a0000000-0000-4000-8000-000000000001',user='b0000000-0000-4000-8000-000000000002',device='c0000000-0000-4000-8000-000000000003';
const config={PORT:3000,STATIC_DIR:process.cwd(),hasSupabase:true,SECURITY_HASH_SALT:'step-up-test-salt',SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'server'};
async function withServer(app,fn){const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));try{await fn(`http://127.0.0.1:${server.address().port}`)}finally{await new Promise(resolve=>server.close(resolve))}}
function req(base,body){return fetch(base+'/api/security/step-up',{method:'POST',headers:{authorization:'Bearer valid-token','x-org-id':org,'content-type':'application/json'},body:JSON.stringify(body)})}
async function setup(identityOverride){const repos=createRepositories();await repos.security.upsertDevice({org_id:org,user_id:user,device_id:device,last_seen:new Date().toISOString()});const identity={async verifyToken(){return{id:user,email:' Owner@Example.Test '}},async membership(){return{role:'owner'}},async audit(){},...identityOverride};return{repos,app:createApp({config,identity,repos})}}

test('password grant result distinguishes wrong password, provider rate limit and unconfirmed email',async()=>{
 for(const [result,status,code,phrase] of [[{userId:null,status:400,errorCode:'invalid_credentials'},403,'STEP_UP_INVALID','incorrect'],[{userId:null,status:429,errorCode:'over_request_rate_limit'},429,'STEP_UP_RATE_LIMITED','Too many'],[{userId:null,status:400,errorCode:'email_not_confirmed'},403,'STEP_UP_EMAIL_UNCONFIRMED','Confirm']]){
  const {app}=await setup({async verifyReauthPassword(){return result}});
  await withServer(app,async base=>{const response=await req(base,{method:'password',password:'  Correct pass  ',deviceId:device});const body=await response.json();assert.equal(response.status,status);assert.equal(body.error.code,code);assert.match(body.error.message,new RegExp(phrase,'i'))});
 }
});

test('successful step-up uses authenticated normalized email and preserves password bytes, then creates device grant',async()=>{
 let received;const {app,repos}=await setup({async verifyReauthPassword(email,password){received={email,password};return{userId:user,status:200,errorCode:null}}});
 await withServer(app,async base=>{const response=await req(base,{method:'password',password:'  Correct pass  ',deviceId:device});assert.equal(response.status,200);assert.equal((await response.json()).granted,true)});
 assert.deepEqual(received,{email:'owner@example.test',password:'  Correct pass  '});assert.equal(await repos.security.hasStepUpGrant(org,user,device),true);
});

test('step-up attempt limiter is separate and returns a service message after provider failure',async()=>{
 const {app}=await setup({async verifyReauthPassword(){return{userId:null,status:503,errorCode:'server_error'}}});
 await withServer(app,async base=>{const response=await req(base,{method:'password',password:'Secret123',deviceId:device});const body=await response.json();assert.equal(response.status,503);assert.equal(body.error.code,'STEP_UP_UNAVAILABLE')});
});
