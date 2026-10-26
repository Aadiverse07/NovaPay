import 'dotenv/config';
import fs from 'node:fs';
import { createApp } from '../server/src/app.js';
import { config } from '../server/src/config.js';

const log = new URL('../docs/WORKLOG.md', import.meta.url);
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
const tokens = {};
const identities = {};
let orgId;
let apiBase;
let server;
let serial = 0;
const stamp = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium', hour12: false }).format(new Date());
function record(kind, message) { fs.appendFileSync(log, `${kind} — ${stamp()} Asia/Kolkata: ${message}\n`); }
function about(action, why) { record('ABOUT TO', `${action}. Reason: ${why}`); }
function result(ok, message, next) { record('RESULT', `${ok ? 'PASS' : 'FAIL'}: ${message}. NEXT: ${next}`); }
async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  let body = null; try { body = await response.json(); } catch {}
  return { status: response.status, body };
}
async function service(path, options = {}) { return request(`${sb}${path}`, { ...options, headers: { ...serviceHeaders, ...(options.headers || {}) } }); }
async function step(label, why, fn) {
  about(label, why);
  try { const value = await fn(); result(true, `${label}; ${value.detail || 'completed'}`, value.next || 'continue T4 live verification'); return value.value ?? value; }
  catch (error) { result(false, `${label}; ${String(error.message || 'failed').replace(/https?:\/\/\S+/g, '[URL]').slice(0, 160)}`, 'inspect the exact failed step; reuse the fixed fixtures'); throw error; }
}
async function authenticate(role) {
  const email = fixtures[role].email;
  const generated = await step(`Generate one-time sign-in link for existing ${role} fixture`, 'authenticate the fixed test user without creating users or resetting credentials', async () => {
    const r = await service('/auth/v1/admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email }) });
    if (r.status !== 200 || !r.body?.hashed_token) throw new Error('fixed-fixture-auth-unavailable');
    return { detail: 'HTTP 200; token remains in memory', value: r.body.hashed_token };
  });
  const verified = await step(`Exchange one-time sign-in link for ${role} JWT`, 'obtain the ordinary user identity for API authorization', async () => {
    const r = await request(`${sb}/auth/v1/verify`, { method: 'POST', headers: anonHeaders, body: JSON.stringify({ type: 'magiclink', token_hash: generated }) });
    if (r.status !== 200 || !r.body?.access_token) throw new Error('fixed-fixture-sign-in-failed');
    return { detail: 'HTTP 200; JWT remains in memory', value: r.body };
  });
  tokens[role] = verified.access_token; identities[role] = verified.user.id;
}
async function api(role, path, options = {}) {
  return request(`${apiBase}${path}`, { ...options, headers: { apikey: anonKey, Authorization: `Bearer ${tokens[role]}`, 'X-Org-Id': orgId, ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) } });
}
function assert(condition, message) { if (!condition) throw new Error(message); }
function q(params) { return new URLSearchParams(params).toString(); }
const oldLog = console.log; console.log = () => {};
try {
  assert(config.hasSupabase, 'required configuration unavailable');
  for (const role of Object.keys(fixtures)) await authenticate(role);
  const orgs = await step('Find fixed Phase 3 verifier organization', 'reuse the known existing org and avoid provisioning data', async () => {
    const r = await service(`/rest/v1/organizations?${q({ select: 'id', name: 'eq.NovaPay Phase 3 Verification A', limit: '2' })}`);
    assert(r.status === 200 && r.body?.length === 1, 'fixed verifier org missing or ambiguous');
    return { detail: 'one existing organization found', value: r.body[0].id };
  }); orgId = orgs;
  const requestRows = await step('Find existing 9999-minor-unit payment_approved request', 'reuse T3 Fixed Live Self Approval, already approved below the two-person threshold', async () => {
    const r = await service(`/rest/v1/maintenance_requests?${q({ select: 'id,status,requested_by,chosen_quotation_id,estimate_minor,title', org_id: `eq.${orgId}`, title: 'eq.T3 Fixed Live Self Approval', limit: '2' })}`);
    assert(r.status === 200 && r.body?.length === 1, 'fixed maintenance request missing or ambiguous');
    const row = r.body[0]; assert(row.status === 'payment_approved' && Number(row.estimate_minor) === 9999, 'fixed request is not eligible');
    assert(row.requested_by === identities.owner, 'fixed request requester mismatch');
    return { detail: 'fixed request eligible; 9999 minor units', value: row };
  });
  const membership = await step('Verify fixed accountant and approver memberships', 'ensure expected roles in fixed organization before using their JWTs', async () => {
    for (const role of ['accountant', 'approver']) {
      const r = await service(`/rest/v1/memberships?${q({ select: 'role', org_id: `eq.${orgId}`, user_id: `eq.${identities[role]}`, limit: '1' })}`);
      assert(r.status === 200 && r.body?.[0]?.role === fixtures[role].role, `fixed ${role} membership mismatch`);
    }
    return { detail: 'both fixed roles confirmed' };
  });
  const column = await step('Confirm migration 0010 payment linkage is visible', 'read-only schema check that the user-applied migration reached the live project', async () => {
    const r = await service(`/rest/v1/approvals?${q({ select: 'fund_maintenance_request_id', limit: '0' })}`);
    assert(r.status === 200, '0010 approval linkage column not visible'); return { detail: `HTTP ${r.status}; column query succeeds` };
  });
  const app = createApp({ config }); server = app.listen(0, '127.0.0.1'); await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); }); apiBase = `http://127.0.0.1:${server.address().port}`;
  const health = await step('Check fresh local API health', 'run current source code against the applied live schema', async () => { const r=await request(`${apiBase}/api/status`); assert(r.status===200,'local API health failed');return {detail:`HTTP ${r.status}`}; });
  const payment = await step('Queue SIMULATED maintenance payment', 'request payment through the existing API queue; no provider call is made in this mode', async () => {
    const r=await api('accountant',`/api/funds/maintenance/${requestRows.id}/payment`,{method:'POST',body:'{}'});
    assert(r.status===202,`payment request returned HTTP ${r.status}`);assert(r.body?.mode==='SIMULATED'&&r.body?.simulated===true&&r.body?.gap==='simulated, no ledger entry','simulated response contract mismatch');
    return {detail:'HTTP 202; SIMULATED; no ledger entry',value:r.body};
  });
  const approvalId = payment.approval?.approvalId;
  assert(typeof approvalId==='string','approval id missing');
  const queue = await step('Read maintenance payment from existing approvals queue', 'confirm the maintenance item appears in GET /api/approvals', async () => {
    const r=await api('approver','/api/approvals');assert(r.status===200,`approval queue returned HTTP ${r.status}`);
    const row=r.body.approvals?.find(item=>item.approvalId===approvalId);assert(row?.proposalType==='maintenance-payment','maintenance payment absent from queue');return {detail:'queue item is pending maintenance-payment'};
  });
  const decision = await step('Approve from existing queue', 'use fixed approver, who is distinct from the owner requester', async () => {
    const r=await api('approver',`/api/approvals/${encodeURIComponent(approvalId)}/decision`,{method:'POST',body:JSON.stringify({decision:'approve',note:'T4 live simulated verification.'})});
    assert(r.status===200,`approval decision returned HTTP ${r.status}`);assert(r.body?.mode==='SIMULATED'&&r.body?.status==='simulated'&&r.body?.ledgerEntryId===null&&r.body?.paypalPayoutRef===null&&r.body?.amountMinor===9999,'simulated payment result mismatch');return {detail:'HTTP 200; SIMULATED paid; no PayPal or ledger reference',value:r.body};
  });
  const retry = await step('Retry same queue decision and verify idempotency', 'repeat the approval on the same ID; payment must not duplicate', async () => {
    const r=await api('approver',`/api/approvals/${encodeURIComponent(approvalId)}/decision`,{method:'POST',body:JSON.stringify({decision:'approve',note:'Idempotency retry.'})});
    assert(r.status===200&&r.body?.paymentId===decision.paymentId,'replayed decision changed or duplicated the payment');return {detail:'same payment id returned'};
  });
  const db = await step('Verify one live payment row, paid request and null ledger/provider refs', 'read persisted state after the idempotent retry', async () => {
    const r=await service(`/rest/v1/fund_maintenance_payments?${q({select:'id,maintenance_request_id,quotation_id,amount_minor,mode,paypal_payout_ref,ledger_entry_id,status',org_id:`eq.${orgId}`,maintenance_request_id:`eq.${requestRows.id}`,limit:'2'})}`);
    assert(r.status===200&&r.body?.length===1,'expected exactly one payment row');const p=r.body[0];assert(p.mode==='SIMULATED'&&p.status==='paid'&&p.paypal_payout_ref===null&&p.ledger_entry_id===null&&Number(p.amount_minor)===9999,'persisted simulated row mismatch');
    const state=await service(`/rest/v1/maintenance_requests?${q({select:'status',org_id:`eq.${orgId}`,id:`eq.${requestRows.id}`,limit:'1'})}`);assert(state.status===200&&state.body?.[0]?.status==='paid','maintenance request did not advance to paid');
    const again=await service(`/rest/v1/fund_maintenance_payments?${q({select:'id',org_id:`eq.${orgId}`,maintenance_request_id:`eq.${requestRows.id}`,limit:'2'})}`);assert(again.body.length===1,'duplicate payment row found');
    return {detail:'one paid SIMULATED row; provider and ledger refs null; request paid'};
  });
  process.stdout.write(JSON.stringify({result:'PASS',migration0010Visible:true,requestTitle:requestRows.title,amountMinor:9999,approvalId,mode:'SIMULATED',paymentId:decision.paymentId,duplicateDecisionSamePayment:true,paymentRows:1,ledgerEntryId:null,paypalPayoutRef:null,noPayPalCall:true,usersOrOrganizationsCreated:0})+'\n');
} catch(error) {
  process.stdout.write(`FAIL ${String(error?.message||'T4 live verification failed').replace(/https?:\/\/\S+/g,'[URL]').slice(0,180)}; see docs/WORKLOG.md for step details.\n`);process.exitCode=1;
} finally { console.log=oldLog;if(server) await new Promise(resolve=>server.close(resolve)); }
