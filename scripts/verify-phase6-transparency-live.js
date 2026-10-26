import 'dotenv/config';
import fs from 'node:fs';
import { createApp } from '../server/src/app.js';
import { config } from '../server/src/config.js';

const journal = new URL('../docs/WORKLOG.md', import.meta.url);
const sb = config.SUPABASE_URL.replace(/\/$/, '');
const serviceKey = config.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = config.SUPABASE_ANON_KEY;
const serviceHeaders = { apikey: serviceKey, ...(serviceKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${serviceKey}` }), 'Content-Type': 'application/json' };
const anonHeaders = { apikey: anonKey, 'Content-Type': 'application/json' };
const fixtures = {
  owner: { email: 'novapay-phase3-owner-a@example.test', role: 'owner' },
  approver: { email: 'novapay-phase3-approver@example.test', role: 'approver' },
  accountant: { email: 'novapay-phase3-accountant@example.test', role: 'accountant' },
  donor: { email: 'novapay-phase6-donor@example.test', role: 'donor', name: 'NovaPay Phase 6 Donor Test' },
  resident: { email: 'novapay-phase6-resident@example.test', role: 'resident', name: 'NovaPay Phase 6 Resident Test' },
};
const tokens = {};
const identities = {};
let orgId;
let apiBase;
let server;
let serial = 0;
const stamp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date());
function journalLine(kind,text){fs.appendFileSync(journal,`${kind} — ${stamp()} Asia/Kolkata: ${text}\n`);}
function about(label,reason){journalLine('ABOUT TO',`${label}. Reason: ${reason}`);}
function outcome(ok,label,detail,next){journalLine('RESULT',`${ok?'PASS':'FAIL'}: ${label}; ${detail}. NEXT: ${next}`);}
function assert(condition,message){if(!condition)throw new Error(message);}
function q(values){return new URLSearchParams(values).toString();}
async function request(url,options={}){const response=await fetch(url,{...options,signal:AbortSignal.timeout(20000)});let body=null;try{body=await response.json();}catch{}return{status:response.status,body,headers:response.headers};}
async function service(path,options={}){return request(`${sb}${path}`,{...options,headers:{...serviceHeaders,...(options.headers||{})}});}
async function step(label,reason,fn){
  about(label,reason);
  try{const result=await fn();outcome(true,label,result.detail||'completed',result.next||'continue T6 live verification');return Object.hasOwn(result,'value')?result.value:result;}
  catch(error){const safe=String(error.message||'step failed').replace(/https?:\/\/\S+/g,'[URL]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[email]').slice(0,180);outcome(false,label,safe,'inspect exact step; do not create new identities/orgs on rerun');throw error;}
}
async function findAuthUser(email){
  for(let page=1;page<=100;page++){
    const r=await service(`/auth/v1/admin/users?page=${page}&per_page=100`);
    assert(r.status===200&&Array.isArray(r.body?.users),`Auth user lookup failed at page ${page}`);
    const found=r.body.users.find(user=>String(user.email||'').toLowerCase()===email.toLowerCase());
    if(found)return found;
    if(r.body.users.length<100)return null;
  }
  throw new Error('Auth user lookup exceeded safe page bound');
}
async function ensureRoleFixture(role){
  const fixture=fixtures[role];
  let user=await step(`Find fixed ${role} test user`, 'reuse the same named Phase 6 role fixture on every run',async()=>({detail:'directory query completed',value:await findAuthUser(fixture.email)}));
  if(!user){
    user=await step(`Create one fixed ${role} test user`, 'Phase 6 live test requires fixed donor/resident roles; create only if missing, with no password or secret in source/output',async()=>{
      const r=await service('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email:fixture.email,email_confirm:true,user_metadata:{name:fixture.name}})});
      assert([200,201].includes(r.status)&&r.body?.id,`fixed ${role} user creation returned HTTP ${r.status}`);
      return{detail:'created fixed role test user once',value:r.body};
    });
  }
  identities[role]=user.id;
  const memberships=await step(`Check fixed ${role} membership`, 'inspect membership in the existing verifier organization',async()=>{
    const r=await service(`/rest/v1/memberships?${q({select:'role',org_id:`eq.${orgId}`,user_id:`eq.${user.id}`,limit:'1'})}`);
    assert(r.status===200,`membership lookup returned HTTP ${r.status}`);return{detail:r.body.length?'existing membership found':'membership missing',value:r.body[0]||null};
  });
  if(!memberships){
    await step(`Add fixed ${role} membership once`, 'grant only the documented donor/resident role in the fixed verifier org',async()=>{
      const r=await service('/rest/v1/memberships',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({org_id:orgId,user_id:user.id,role:fixture.role})});
      assert([200,201,204].includes(r.status),`membership insert returned HTTP ${r.status}`);return{detail:'fixed membership created'};
    });
  }else if(memberships.role!==fixture.role){
    await step(`Correct fixed ${role} membership role`, 'keep the existing named fixture aligned with its designated live role',async()=>{
      const r=await service(`/rest/v1/memberships?${q({org_id:`eq.${orgId}`,user_id:`eq.${user.id}`})}`,{method:'PATCH',body:JSON.stringify({role:fixture.role})});
      assert([200,204].includes(r.status),`membership role update returned HTTP ${r.status}`);return{detail:'fixed membership role aligned'};
    });
  }
}
async function authenticate(role){
  const link=await step(`Generate sign-in link for fixed ${role}`, 'authenticate existing test user without passwords or email delivery',async()=>{
    const r=await service('/auth/v1/admin/generate_link',{method:'POST',body:JSON.stringify({type:'magiclink',email:fixtures[role].email})});
    assert(r.status===200&&r.body?.hashed_token,`fixed ${role} magic link unavailable`);return{detail:'HTTP 200; token remains in memory',value:r.body.hashed_token};
  });
  const session=await step(`Exchange sign-in link for fixed ${role} JWT`, 'obtain ordinary JWT for API/RLS probes',async()=>{
    const r=await request(`${sb}/auth/v1/verify`,{method:'POST',headers:anonHeaders,body:JSON.stringify({type:'magiclink',token_hash:link})});
    assert(r.status===200&&r.body?.access_token,`fixed ${role} login failed`);return{detail:'HTTP 200; JWT remains in memory',value:r.body};
  });
  tokens[role]=session.access_token;identities[role]=session.user.id;
}
async function api(role,path,options={}){
  return request(`${apiBase}${path}`,{...options,headers:{apikey:anonKey,Authorization:`Bearer ${tokens[role]}`,'X-Org-Id':orgId,...(options.body===undefined?{}:{'Content-Type':'application/json'})}});
}
async function asUser(role,path){return request(`${sb}${path}`,{headers:{apikey:anonKey,Authorization:`Bearer ${tokens[role]}`}});}
const oldLog=console.log;console.log=()=>{};
try{
  assert(config.hasSupabase,'Supabase configuration unavailable');
  for(const role of ['owner','approver','accountant'])await authenticate(role);
  orgId=await step('Find fixed Phase 3 verifier organization','reuse the existing fixed organization',async()=>{
    const r=await service(`/rest/v1/organizations?${q({select:'id',name:'eq.NovaPay Phase 3 Verification A',limit:'2'})}`);assert(r.status===200&&r.body?.length===1,'fixed org missing or ambiguous');return{detail:'one fixed organization',value:r.body[0].id};
  });
  await ensureRoleFixture('donor');await ensureRoleFixture('resident');
  for(const role of Object.keys(fixtures))if(!tokens[role])await authenticate(role);
  const requestRow=await step('Find existing T4/T5 paid maintenance expense','reuse the fixed Phase 3 payment/evidence verification request',async()=>{
    const r=await service(`/rest/v1/maintenance_requests?${q({select:'id,status,title',org_id:`eq.${orgId}`,title:'eq.T3 Fixed Live Self Approval',limit:'2'})}`);assert(r.status===200&&r.body?.length===1,'fixed maintenance row missing or ambiguous');assert(['paid','evidence_submitted','reviewed','closed'].includes(r.body[0].status),'fixed request not complete');return{detail:`request state ${r.body[0].status}`,value:r.body[0]};
  });
  await step('Confirm migration 0012 visibility','verify read RPCs work through API only and schema is deployed',async()=>{
    const r=await service(`/rest/v1/rpc/get_fund_transparency` ,{method:'POST',body:JSON.stringify({p_org:orgId,p_actor:identities.resident,p_campaign_id:null})});
    assert(r.status===200,`transparency RPC schema/status HTTP ${r.status}`);return{detail:'member-checked transparency RPC returned HTTP 200'};
  });
  for(const role of ['resident','donor'])for(const table of ['fund_contributions','fund_maintenance_payments','fund_completion_evidence']){
    await step(`Deny ${role} direct SELECT on ${table}`,'prove donors/residents must use the read-only endpoint rather than direct table access',async()=>{
      const r=await asUser(role,`/rest/v1/${table}?select=id&limit=0`);assert([401,403].includes(r.status),`direct SELECT returned HTTP ${r.status}`);return{detail:`HTTP ${r.status}; direct SELECT denied`};
    });
  }
  for(const name of ['get_fund_transparency','get_fund_audit_export'])await step(`Deny ordinary JWT execution of ${name}`,'prove service-role-only read RPC grants',async()=>{
    const body=name==='get_fund_transparency'?{p_org:orgId,p_actor:identities.resident,p_campaign_id:null}:{p_org:orgId,p_actor:identities.owner,p_from:null,p_to:null};
    const r=await request(`${sb}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:anonKey,Authorization:`Bearer ${tokens.owner}`,'Content-Type':'application/json'},body:JSON.stringify(body)});assert(r.status===403,`${name} returned HTTP ${r.status}, expected 403`);return{detail:'HTTP 403'};
  });
  const app=createApp({config});server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});apiBase=`http://127.0.0.1:${server.address().port}`;
  await step('Check fresh local API health','run current API source against the applied schema',async()=>{const r=await request(`${apiBase}/api/status`);assert(r.status===200,'local API health failed');return{detail:'HTTP 200'};});
  let donorShape;
  for(const role of ['donor','resident'])await step(`Read transparency as ${role}`,'confirm role-specific read is org-scoped, privacy-safe and exposes gaps',async()=>{
    const r=await api(role,'/api/funds/transparency');assert(r.status===200,`transparency endpoint returned HTTP ${r.status}`);const body=r.body;
    assert(body.namesShown===false,'namesShown must be false');assert(/Real-money pooled funds/.test(body.legalCaution||''),'legal caution missing');
    assert(!JSON.stringify(body).includes('donorRef"'), 'raw donor ref field leaked');
    for(const contribution of body.contributions||[]){assert(typeof contribution.donorRefHash==='string'&&contribution.donorRefHash.length===64,'donor reference hash missing');assert(!Object.hasOwn(contribution,'donorRef'),'raw donor reference was exposed');}
    const expense=body.expenses?.find(row=>row.requestId===requestRow.id);assert(expense,'fixed expense missing from transparency');
    assert(expense.payment.mode==='SIMULATED'&&expense.paymentReference===null&&expense.ledgerEntryId===null,'simulated payment refs mismatch');
    assert(expense.gaps.some(row=>row.gap==='no payment reference')&&expense.gaps.some(row=>row.gap==='simulated, no ledger entry'),'simulated payment gaps missing');
    assert(Array.isArray(expense.completionEvidence),'evidence links missing');
    for(const ev of expense.completionEvidence){assert(!Object.hasOwn(ev,'description')&&!Object.hasOwn(ev,'fileRef')&&!Object.hasOwn(ev,'submittedBy'),'private evidence metadata leaked');}
    const shape={campaigns:(body.campaigns||[]).map(row=>({id:row.campaign?.id,receivedMinor:row.receivedMinor})),contributions:(body.contributions||[]).map(row=>({id:row.id,donorRefHash:row.donorRefHash,status:row.status})),expenses:(body.expenses||[]).map(row=>({requestId:row.requestId,mode:row.payment?.mode,gaps:row.gaps}))};
    if(role==='donor')donorShape=shape;else assert(JSON.stringify(shape)===JSON.stringify(donorShape),'donor/resident transparency slices differ');
    return{detail:`HTTP 200; ${body.expenses.length} expense rows; raw refs/names absent`};
  });
  await step('Deny cross-org transparency request','verify fixed resident token cannot select another org via header',async()=>{
    const r=await request(`${apiBase}/api/funds/transparency`,{headers:{apikey:anonKey,Authorization:`Bearer ${tokens.resident}`,'X-Org-Id':'b0000000-0000-4000-8000-000000000001'}});assert(r.status===403,'cross-org request was not denied');return{detail:'HTTP 403'};
  });
  await step('Deny audit CSV to resident','confirm export is restricted to owner/admin',async()=>{const r=await api('resident','/api/funds/transparency/audit.csv');assert(r.status===403,'resident audit export was not denied');return{detail:'HTTP 403'};});
  await step('Download org-scoped audit CSV as owner','verify CSV endpoint, safe columns, org scoping and no raw metadata',async()=>{
    const r=await api('owner','/api/funds/transparency/audit.csv');assert(r.status===200&&/text\/csv/.test(r.headers.get('content-type')||''),'audit CSV response invalid');
    const csv=await r.text();assert(csv.startsWith('"id","createdAt","action","entity","entityId","actorRef","requestId"'),'CSV header mismatch');
    assert(!csv.includes('private-donor@example.test')&&!csv.includes('metadata')&&!csv.includes('owner-user'),'sensitive audit field leaked');return{detail:'HTTP 200; CSV headers safe; no metadata/raw actor ID'};
  });
  process.stdout.write(JSON.stringify({result:'PASS',migration0012Visible:true,requestTitle:requestRow.title,donorAndResidentReads:'2/2 PASS',directTableSelectDenials:'6/6',ordinaryJwtRpcDenials:'2/2 HTTP 403',crossOrgDenied:true,auditCsvOwnerOnly:true,donorRefsHashed:true,namesShown:false,simulatedGapsVisible:true,fixedRoleUsersCreatedOnlyIfMissing:true,organizationCountCreated:0})+'\n');
}catch(error){process.stdout.write(`FAIL ${String(error.message||'T6 live verification failed').replace(/https?:\/\/\S+/g,'[URL]').slice(0,180)}; see docs/WORKLOG.md for exact step.\n`);process.exitCode=1;}
finally{console.log=oldLog;if(server)await new Promise(resolve=>server.close(resolve));}
