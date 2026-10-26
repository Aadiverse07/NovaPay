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
};
const evidenceDescription = 'NovaPay Phase 6 T5 fixed live completion evidence metadata.';
const evidenceFileRef = 'phase6-verification/inspection-metadata-only.txt';
const tokens = {};
const identities = {};
let orgId;
let apiBase;
let server;
let serial = 0;
const stamp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date());
function journalLine(kind, text) { fs.appendFileSync(journal, `${kind} — ${stamp()} Asia/Kolkata: ${text}\n`); }
function about(label, reason) { journalLine('ABOUT TO', `${label}. Reason: ${reason}`); }
function outcome(ok, label, detail, next) { journalLine('RESULT', `${ok ? 'PASS' : 'FAIL'}: ${label}; ${detail}. NEXT: ${next}`); }
function assert(condition, message) { if (!condition) throw new Error(message); }
function q(values) { return new URLSearchParams(values).toString(); }
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  let body = null; try { body = await response.json(); } catch {}
  return { status: response.status, body };
}
async function service(path, options = {}) { return request(`${sb}${path}`, { ...options, headers: { ...serviceHeaders, ...(options.headers || {}) } }); }
async function step(label, why, fn) {
  about(label, why);
  try {
    const result = await fn();
    outcome(true, label, result.detail || 'completed', result.next || 'continue T5 live verification');
    return Object.hasOwn(result, 'value') ? result.value : result;
  } catch (error) {
    const safe = String(error.message || 'step failed').replace(/https?:\/\/\S+/g, '[URL]').replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]').slice(0, 180);
    outcome(false, label, safe, 'inspect this step; reuse fixed existing rows and do not create users or organizations');
    throw error;
  }
}
async function authenticate(role) {
  const link = await step(`Generate sign-in link for fixed ${role} user`, 'reuse existing named test user without creating an account or resetting credentials', async () => {
    const r = await service('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email: fixtures[role].email }) });
    assert(r.status === 200 && r.body?.hashed_token, `fixed ${role} authentication unavailable`);
    return { detail: 'HTTP 200; one-time token stays in memory', value: r.body.hashed_token };
  });
  const session = await step(`Exchange sign-in link for fixed ${role} JWT`, 'obtain ordinary user identity for route and RPC permission checks', async () => {
    const r = await request(`${sb}/auth/v1/verify`, { method: 'POST', headers: anonHeaders, body: JSON.stringify({ type: 'magiclink', token_hash: link }) });
    assert(r.status === 200 && r.body?.access_token, `fixed ${role} sign-in failed`);
    return { detail: 'HTTP 200; JWT stays in memory', value: r.body };
  });
  tokens[role] = session.access_token;
  identities[role] = session.user.id;
}
async function api(role, path, options = {}) {
  return request(`${apiBase}${path}`, { ...options, headers: { apikey: anonKey, Authorization: `Bearer ${tokens[role]}`, 'X-Org-Id': orgId, ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) } });
}
async function rpcAsUser(role, name, body) {
  return request(`${sb}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${tokens[role]}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const oldLog = console.log; console.log = () => {};
try {
  assert(config.hasSupabase, 'Supabase configuration unavailable');
  for (const role of Object.keys(fixtures)) await authenticate(role);
  orgId = await step('Find fixed Phase 3 verification organization', 'reuse the existing organization', async () => {
    const r = await service(`/rest/v1/organizations?${q({ select: 'id', name: 'eq.NovaPay Phase 3 Verification A', limit: '2' })}`);
    assert(r.status === 200 && r.body?.length === 1, 'fixed organization missing or ambiguous');
    return { detail: 'one fixed organization found', value: r.body[0].id };
  });
  const requestRow = await step('Find fixed T4 paid maintenance request', 'reuse the already paid SIMULATED request from T4', async () => {
    const r = await service(`/rest/v1/maintenance_requests?${q({ select: 'id,status,requested_by,title', org_id: `eq.${orgId}`, title: 'eq.T3 Fixed Live Self Approval', limit: '2' })}`);
    assert(r.status === 200 && r.body?.length === 1, 'fixed request missing or ambiguous');
    assert(['paid','evidence_submitted','reviewed','closed'].includes(r.body[0].status), 'fixed request is not paid or in T5 completion');
    assert(r.body[0].requested_by === identities.owner, 'fixed requester mismatch');
    return { detail: `fixed request status ${r.body[0].status}`, value: r.body[0] };
  });
  await step('Verify fixed accountant and approver memberships', 'confirm submission and reviewer roles in the fixed org', async () => {
    for (const role of ['accountant','approver']) {
      const r=await service(`/rest/v1/memberships?${q({select:'role',org_id:`eq.${orgId}`,user_id:`eq.${identities[role]}`,limit:'1'})}`);
      assert(r.status===200&&r.body?.[0]?.role===fixtures[role].role,`${role} membership mismatch`);
    }
    return {detail:'accountant and approver roles confirmed'};
  });
  await step('Confirm migration 0011 schema visibility', 'read new evidence-review and request-close columns before calling T5 routes', async () => {
    const e=await service(`/rest/v1/fund_completion_evidence?${q({select:'review_status,reviewed_by,reviewed_at,review_note,request_id',limit:'0'})}`);
    const m=await service(`/rest/v1/maintenance_requests?${q({select:'reviewed_by,reviewed_at,closed_by,closed_at',limit:'0'})}`);
    assert(e.status===200&&m.status===200,`0011 column visibility failed (${e.status}/${m.status})`);
    return {detail:'all evidence and maintenance review columns visible'};
  });
  for (const name of ['submit_fund_completion_evidence','review_fund_completion_evidence','close_fund_maintenance_request']) {
    await step(`Deny ordinary JWT execution of ${name}`, 'prove SECURITY DEFINER RPC is not executable by authenticated user role', async () => {
      const args=name==='submit_fund_completion_evidence'
        ? {p_org:orgId,p_actor:identities.accountant,p_request:requestRow.id,p_kind:'other',p_description:'permission probe',p_file_ref:null,p_request_id:`rpc-probe-${name}`}
        : name==='review_fund_completion_evidence'
          ? {p_org:orgId,p_actor:identities.approver,p_request:requestRow.id,p_evidence:'00000000-0000-4000-8000-000000000001',p_decision:'accept',p_note:null,p_request_id:`rpc-probe-${name}`}
          : {p_org:orgId,p_actor:identities.approver,p_request:requestRow.id,p_request_id:`rpc-probe-${name}`};
      const r=await rpcAsUser('accountant',name,args);
      assert(r.status===403,`${name} ordinary JWT returned HTTP ${r.status}, expected 403`);
      return {detail:'HTTP 403'};
    });
  }
  await step('Deny direct authenticated evidence table write', 'prove existing RLS/grants still block direct client inserts', async () => {
    const r=await request(`${sb}/rest/v1/fund_completion_evidence`,{method:'POST',headers:{apikey:anonKey,Authorization:`Bearer ${tokens.accountant}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({org_id:orgId,maintenance_request_id:requestRow.id,kind:'other',description:'Direct-write denial probe.',file_ref:null,submitted_by:identities.accountant})});
    assert([401,403].includes(r.status),`direct evidence insert returned unexpected HTTP ${r.status}`);
    return {detail:`HTTP ${r.status}; direct insert denied`};
  });
  const evidenceRows=await step('Find deterministic T5 evidence metadata row', 'reuse the exact prior verifier row if this script resumes', async () => {
    const r=await service(`/rest/v1/fund_completion_evidence?${q({select:'id,org_id,maintenance_request_id,kind,description,file_ref,submitted_by,review_status,reviewed_by,review_note',org_id:`eq.${orgId}`,maintenance_request_id:`eq.${requestRow.id}`,description:`eq.${evidenceDescription}`,limit:'2'})}`);
    assert(r.status===200&&r.body.length<=1,'duplicate fixed evidence metadata rows found');
    return {detail:r.body.length?'one existing row reused':'no row yet',value:r.body[0]||null};
  });
  let evidence=evidenceRows;
  const app=createApp({config});server=app.listen(0,'127.0.0.1');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});apiBase=`http://127.0.0.1:${server.address().port}`;
  await step('Check fresh local API health', 'exercise current source against applied migration 0011', async()=>{const r=await request(`${apiBase}/api/status`);assert(r.status===200,'local API health failed');return {detail:'HTTP 200'};});
  if(!evidence){
    evidence=await step('Submit metadata-only completion evidence', 'submit fixed description/kind/file-reference metadata; no file contents are stored', async()=>{
      const r=await api('accountant',`/api/funds/maintenance/${requestRow.id}/evidence`,{method:'POST',body:JSON.stringify({kind:'inspection',description:evidenceDescription,fileRef:evidenceFileRef})});
      assert(r.status===201,`evidence submission returned HTTP ${r.status}`);assert(/supports, but does not prove/i.test(r.body?.caution||''),'non-proof caution missing');
      return {detail:'HTTP 201; metadata only; caution present',value:r.body.evidence};
    });
  }
  assert(evidence.maintenance_request_id===requestRow.id&&evidence.file_ref===evidenceFileRef,'fixed evidence row mismatch');
  if(evidence.review_status==='pending'){
    const reviewed=await step('Accept fixed completion evidence as approver', 'reviewer differs from requester and evidence submitter', async()=>{
      const r=await api('approver',`/api/funds/maintenance/${requestRow.id}/evidence/${evidence.id}/review`,{method:'POST',body:JSON.stringify({decision:'accept',note:'T5 live metadata review.'})});
      assert(r.status===200&&r.body?.evidence?.review_status==='accepted',`evidence review returned HTTP ${r.status}`);assert(/supports, but does not prove/i.test(r.body?.caution||''),'review caution missing');return {detail:'HTTP 200; accepted; caution present',value:r.body};
    });
    evidence=reviewed.evidence;
  } else assert(evidence.review_status==='accepted','fixed evidence has a rejected/nonaccepted review state');
  const current=await step('Confirm maintenance request reached reviewed state', 'ensure accepted evidence review advanced the request', async()=>{
    const r=await service(`/rest/v1/maintenance_requests?${q({select:'id,status,reviewed_by,reviewed_at,closed_by,closed_at',org_id:`eq.${orgId}`,id:`eq.${requestRow.id}`,limit:'1'})}`);
    assert(r.status===200&&r.body?.length===1&&['reviewed','closed'].includes(r.body[0].status),'request did not reach reviewed state');return {detail:`request is ${r.body[0].status}`,value:r.body[0]};
  });
  let closed=current;
  if(current.status==='reviewed') closed=await step('Close maintenance request as approver', 'close only after evidence review reached reviewed', async()=>{
    const r=await api('approver',`/api/funds/maintenance/${requestRow.id}/close`,{method:'POST',body:'{}'});assert(r.status===200&&r.body?.closed===true&&r.body?.request?.status==='closed',`close returned HTTP ${r.status}`);return {detail:'HTTP 200; request closed',value:r.body.request};
  });
  const final=await step('Verify final closure and evidence metadata', 'confirm reviewer/closure stamps and one accepted metadata row', async()=>{
    const rows=await service(`/rest/v1/fund_completion_evidence?${q({select:'id,kind,description,file_ref,review_status,reviewed_by,reviewed_at',org_id:`eq.${orgId}`,maintenance_request_id:`eq.${requestRow.id}`,description:`eq.${evidenceDescription}`,limit:'2'})}`);
    assert(rows.status===200&&rows.body?.length===1&&rows.body[0].review_status==='accepted','final evidence row mismatch');
    const state=await service(`/rest/v1/maintenance_requests?${q({select:'status,reviewed_by,reviewed_at,closed_by,closed_at',org_id:`eq.${orgId}`,id:`eq.${requestRow.id}`,limit:'1'})}`);
    assert(state.status===200&&state.body?.[0]?.status==='closed'&&state.body[0].reviewed_by&&state.body[0].closed_by,'final request closure stamps missing');
    return {detail:'one accepted metadata row; request closed with reviewer/closure stamps'};
  });
  process.stdout.write(JSON.stringify({result:'PASS',requestTitle:requestRow.title,status:'closed',evidenceId:evidence.id,kind:evidence.kind,fileRefMetadataOnly:true,reviewStatus:evidence.review_status,reviewerRole:'approver',ordinaryJwtRpcDenials:'3/3 HTTP 403',directTableWriteDenied:true,usersOrOrganizationsCreated:0,fileUploaded:false})+'\n');
} catch(error) {
  process.stdout.write(`FAIL ${String(error.message||'T5 live verification failed').replace(/https?:\/\/\S+/g,'[URL]').slice(0,180)}; see docs/WORKLOG.md for exact step.\n`);process.exitCode=1;
} finally { console.log=oldLog;if(server)await new Promise(resolve=>server.close(resolve)); }
